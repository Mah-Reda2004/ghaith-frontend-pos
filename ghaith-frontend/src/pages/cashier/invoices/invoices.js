// ==========================================================================
// سجل الفواتير — منطق كامل: تحميل البيانات، فلاتر، Pagination، مودال التفاصيل، طباعة
// البيانات تُحمّل من API الفواتير الحالي.
// ==========================================================================

import { api, listFrom } from "../../../core/api.js";

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* 1) الثيم                                                            */
  /* ------------------------------------------------------------------ */
  const THEME_KEY = "ghaith-theme";
  function initTheme() {
    document.documentElement.setAttribute(
      "data-theme",
      localStorage.getItem(THEME_KEY) || "dark"
    );
  }
  if (document.documentElement.dataset.cashierSpa !== "true") {
    initTheme();
    document.getElementById("themeToggleBtn").addEventListener("click", () => {
      const next =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "light"
          : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(THEME_KEY, next);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 2) عناصر DOM                                                        */
  /* ------------------------------------------------------------------ */
  const els = {
    filterInvNo:    document.getElementById("filterInvNo"),
    filterCustomer: document.getElementById("filterCustomer"),
    filterPhone:    document.getElementById("filterPhone"),
    filterDate:     document.getElementById("filterDate"),
    filterCashier:  document.getElementById("filterCashier"),
    filterMethod:   document.getElementById("filterMethod"),
    filterStatus:   document.getElementById("filterStatus"),
    searchBtn:      document.getElementById("searchBtn"),
    resetBtn:       document.getElementById("resetBtn"),
    emptyResetBtn:  document.getElementById("emptyResetBtn"),
    retryBtn:       document.getElementById("retryBtn"),

    tableLoading:   document.getElementById("tableLoading"),
    tableEmpty:     document.getElementById("tableEmpty"),
    tableError:     document.getElementById("tableError"),
    tableWrapper:   document.getElementById("tableWrapper"),
    invoicesTbody:  document.getElementById("invoicesTbody"),
    paginationBar:  document.getElementById("paginationBar"),
    paginationInfo: document.getElementById("paginationInfo"),
    paginationPages:document.getElementById("paginationPages"),

    // مودال التفاصيل
    detailOverlay:  document.getElementById("invoiceDetailOverlay"),
    detailBody:     document.getElementById("detailBody"),
    detailTitle:    document.getElementById("invoiceDetailTitle"),
    closeDetailBtn: document.getElementById("closeDetailBtn"),
    closeDetailOkBtn: document.getElementById("closeDetailOkBtn"),
    printDetailBtn: document.getElementById("printDetailBtn"),
    toastStack:     document.getElementById("toastStack"),
    printArea:      document.getElementById("printArea"),
    returnFlowOverlay: document.getElementById("returnFlowOverlay"),
    returnFlowBody: document.getElementById("returnFlowBody"),
    returnFlowTitle: document.getElementById("returnFlowTitle"),
    returnFlowInvoiceNo: document.getElementById("returnFlowInvoiceNo"),
    closeReturnFlowBtn: document.getElementById("closeReturnFlowBtn"),
  };

  /* ------------------------------------------------------------------ */
  /* 3) الحالة (State)                                                   */
  /* ------------------------------------------------------------------ */
  const state = {
    page: 1,
    pageSize: 10,
    filters: {},
    allData: [],    // Mock: كل البيانات من JSON
    returns: [],
    currentInvoice: null,
    returnStep: "select",
    returnItems: [],
    replacementProducts: [],
    exchangeCart: [],
    refundMethod: "store-credit",
    paymentMethod: "cash",
    exchangeCategory: "الكل",
    exchangeQuery: "",
  };

  /* ------------------------------------------------------------------ */
  /* 4) أدوات مساعدة                                                     */
  /* ------------------------------------------------------------------ */
  function escapeHtml(str = "") {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatMoney(n) {
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(iso) {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return { date, time };
  }

  function debounce(fn, ms = 350) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function showToast(msg, type = "success") {
    const el = document.createElement("div");
    el.className = "toast" + (type === "error" ? " is-error" : "");
    el.textContent = msg;
    els.toastStack.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  /* ------------------------------------------------------------------ */
  /* 5) حالة الـ Status → class                                          */
  /* ------------------------------------------------------------------ */
  const STATUS_MAP = {
    "مكتملة":  { cls: "is-done",    label: "مكتملة" },
    "قيد الدفع": { cls: "is-pending", label: "قيد الدفع" },
    "آجل":     { cls: "is-debt",    label: "آجل" },
    "ملغاة":   { cls: "is-cancel",  label: "ملغاة" },
  };

  const METHOD_ICONS = {
    "نقدي":    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>`,
    "محفظة":   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><circle cx="16" cy="14" r="1"/></svg>`,
    "فيزا":    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>`,
    "تحويل":   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>`,
    "آجل":     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  };
  const STATUS_LABELS = { completed: "مكتملة", pending: "قيد الدفع", deferred: "آجل", cancelled: "ملغاة", void: "ملغاة", returned: "مرتجع" };
  const PAYMENT_LABELS = { cash: "نقدي", wallet: "محفظة", card: "فيزا", transfer: "تحويل", instapay: "تحويل", deferred: "آجل" };

  function normalizeInvoice(item) {
    const customer = item.customer || {}, cashier = item.cashier || item.created_by || {}, sales = item.sales_person || {};
    return {
      ...item,
      id: String(item.id),
      number: item.invoice_number || item.number || item.id,
      customer: customer.name || item.customer_name || "عميل نقدي",
      phone: customer.phone || item.customer_phone || "",
      date: item.created_at || item.invoice_date || new Date().toISOString(),
      cashier: cashier.name || cashier.username || item.cashier_name || "—",
      sales: sales.name || sales.username || item.sales_person_name || "—",
      items_count: item.items_count ?? item.item_count ?? item.items?.length ?? 0,
      payment_method: PAYMENT_LABELS[item.payment_method] || item.payment_method || "—",
      status: STATUS_LABELS[item.status] || item.status || "مكتملة",
      total: Number(item.total_amount ?? item.total ?? 0),
      subtotal: Number(item.subtotal ?? 0),
      discount: Number(item.discount_amount ?? 0),
      paid: Number(item.paid_amount ?? 0),
      remaining: Number(item.remaining_amount ?? 0),
      items: item.items || item.invoice_items || []
    };
  }

  /* ------------------------------------------------------------------ */
  /* 6) إخفاء/إظهار حالات الجدول                                         */
  /* ------------------------------------------------------------------ */
  function showState(state) {
    els.tableLoading.style.display = "none";
    els.tableEmpty.style.display   = "none";
    els.tableError.style.display   = "none";
    els.tableWrapper.style.display = "none";
    els.paginationBar.style.display = "none";
    if (state === "loading") els.tableLoading.style.display = "flex";
    if (state === "empty")   els.tableEmpty.style.display   = "flex";
    if (state === "error")   els.tableError.style.display   = "flex";
    if (state === "data") {
      els.tableWrapper.style.display  = "block";
      els.paginationBar.style.display = "flex";
    }
  }

  /* ------------------------------------------------------------------ */
  /* 7) تحميل البيانات من الخادم                                         */
  /* ------------------------------------------------------------------ */
  async function loadData() {
    showState("loading");
    try {
      const [response, returnsResponse] = await Promise.all([
        api.get("/api/v1/invoices", { query: { page: 1, page_size: 100 } }),
        api.get("/api/v1/returns", { query: { page: 1, page_size: 100 } })
      ]);
      state.allData = listFrom(response).map(normalizeInvoice);
      state.returns = listFrom(returnsResponse);
      renderTable();
    } catch (e) {
      showState("error");
    }
  }

  /* ------------------------------------------------------------------ */
  /* 8) فلترة البيانات (Mock — في الحقيقي الـ API يعمل ده)              */
  /* ------------------------------------------------------------------ */
  function getFiltered() {
    const f = state.filters;
    return state.allData.filter(inv => {
      if (f.invNo    && !inv.number.toLowerCase().includes(f.invNo.toLowerCase())) return false;
      if (f.customer && !inv.customer.toLowerCase().includes(f.customer.toLowerCase())) return false;
      if (f.phone    && inv.phone && !inv.phone.includes(f.phone)) return false;
      if (f.cashier  && inv.cashier !== f.cashier) return false;
      if (f.method   && inv.payment_method !== f.method) return false;
      if (f.status   && inv.status !== f.status) return false;
      if (f.date) {
        const invDate = new Date(inv.date).toISOString().slice(0, 10);
        if (invDate !== f.date) return false;
      }
      return true;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 9) رسم الجدول                                                        */
  /* ------------------------------------------------------------------ */
  function renderTable() {
    const filtered = getFiltered();
    const total = filtered.length;

    if (total === 0) { showState("empty"); return; }

    const start = (state.page - 1) * state.pageSize;
    const pageData = filtered.slice(start, start + state.pageSize);

    // Build rows using DocumentFragment for performance
    const frag = document.createDocumentFragment();
    pageData.forEach(inv => {
      const tr = document.createElement("tr");
      tr.dataset.invoiceId = inv.id;
      tr.className = "inv-table-row";
      tr.tabIndex = 0;
      tr.setAttribute("role", "button");
      tr.setAttribute("aria-label", `عرض تفاصيل الفاتورة ${inv.id}`);
      const { date, time } = formatDate(inv.date);
      const st = STATUS_MAP[inv.status] || { cls: "is-done", label: inv.status };
      const methodIcon = METHOD_ICONS[inv.payment_method] || "";
      tr.innerHTML = `
        <td><span class="inv-no">#${escapeHtml(inv.number)}</span></td>
        <td><span class="inv-customer">${escapeHtml(inv.customer)}</span></td>
        <td><span style="font-size:var(--fs-sm);direction:ltr;display:inline-block;">${escapeHtml(inv.phone || "---")}</span></td>
        <td>
          <div class="inv-date-cell">
            <span class="inv-date">${escapeHtml(date)}</span>
            <span class="inv-time">${escapeHtml(time)}</span>
          </div>
        </td>
        <td><span style="font-size:var(--fs-sm);">${escapeHtml(inv.cashier)}</span></td>
        <td><span class="inv-sales">${escapeHtml(inv.sales || "—")}</span></td>
        <td><span class="inv-items-badge">${inv.items_count} pcs</span></td>
        <td>
          <span class="inv-method">
            ${methodIcon}
            ${escapeHtml(inv.payment_method)}
          </span>
        </td>
        <td><span class="inv-total">${formatMoney(inv.subtotal)}</span></td>
        <td><span class="inv-total">${formatMoney(inv.discount)}</span></td>
        <td><span class="inv-total">${formatMoney(inv.total)}</span></td>
        <td><span class="inv-total">${formatMoney(inv.paid)}</span></td>
        <td><span class="inv-total">${formatMoney(inv.remaining)}</span></td>
        <td><span class="inv-status ${st.cls}">${escapeHtml(st.label)}</span></td>
        <td>
          <div class="row-actions">
            <button class="inv-action-btn" data-action="view" data-id="${escapeHtml(inv.id)}" title="عرض التفاصيل">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="inv-action-btn is-print" data-action="print" data-id="${escapeHtml(inv.id)}" title="طباعة">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            </button>
            <button class="inv-action-btn" data-action="return-flow" data-id="${escapeHtml(inv.id)}" title="استرجاع أو استبدال">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v1"/></svg>
            </button>
          </div>
        </td>
      `;
      frag.appendChild(tr);
    });

    els.invoicesTbody.innerHTML = "";
    els.invoicesTbody.appendChild(frag);

    // Pagination info
    els.paginationInfo.textContent = `عرض ${Math.min(start + state.pageSize, total)} من أصل ${total} فاتورة`;
    renderPagination(Math.ceil(total / state.pageSize));
    showState("data");
  }

  /* ------------------------------------------------------------------ */
  /* 10) Pagination                                                       */
  /* ------------------------------------------------------------------ */
  function renderPagination(totalPages) {
    const frag = document.createDocumentFragment();

    // Previous
    const prev = document.createElement("button");
    prev.className = "page-btn";
    prev.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
    prev.disabled = state.page === 1;
    prev.addEventListener("click", () => { if (state.page > 1) { state.page--; renderTable(); } });
    frag.appendChild(prev);

    // Pages
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement("button");
      btn.className = "page-btn" + (i === state.page ? " is-active" : "");
      btn.textContent = i;
      btn.addEventListener("click", () => { state.page = i; renderTable(); });
      frag.appendChild(btn);
    }

    // Next
    const next = document.createElement("button");
    next.className = "page-btn";
    next.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
    next.disabled = state.page === totalPages;
    next.addEventListener("click", () => { if (state.page < totalPages) { state.page++; renderTable(); } });
    frag.appendChild(next);

    els.paginationPages.innerHTML = "";
    els.paginationPages.appendChild(frag);
  }

  /* ------------------------------------------------------------------ */
  /* 11) فلاتر البحث                                                     */
  /* ------------------------------------------------------------------ */
  function applyFilters() {
    state.page = 1;
    state.filters = {
      invNo:    els.filterInvNo.value.trim(),
      customer: els.filterCustomer.value.trim(),
      phone:    els.filterPhone.value.trim(),
      date:     els.filterDate.value,
      cashier:  els.filterCashier.value,
      method:   els.filterMethod.value,
      status:   els.filterStatus.value,
    };
    renderTable();
  }

  function resetFilters() {
    els.filterInvNo.value    = "";
    els.filterCustomer.value = "";
    els.filterPhone.value    = "";
    els.filterDate.value     = "";
    els.filterCashier.value  = "";
    els.filterMethod.value   = "";
    els.filterStatus.value   = "";
    state.filters = {};
    state.page = 1;
    renderTable();
  }

  // Debounce على حقول النص
  const debouncedFilter = debounce(applyFilters, 350);
  [els.filterInvNo, els.filterCustomer, els.filterPhone].forEach(el => {
    el.addEventListener("input", debouncedFilter);
  });
  [els.filterDate, els.filterCashier, els.filterMethod, els.filterStatus].forEach(el => {
    el.addEventListener("change", applyFilters);
  });

  els.searchBtn.addEventListener("click", applyFilters);
  els.resetBtn.addEventListener("click", resetFilters);
  els.emptyResetBtn.addEventListener("click", resetFilters);
  els.retryBtn.addEventListener("click", loadData);

  /* ------------------------------------------------------------------ */
  /* 12) Row Actions — View / Print                                      */
  /* ------------------------------------------------------------------ */
  els.invoicesTbody.addEventListener("click", async e => {
    const btn = e.target.closest("[data-action]");
    const row = e.target.closest("tr[data-invoice-id]");
    const id = btn ? btn.dataset.id : row && row.dataset.invoiceId;
    if (!id) return;
    let inv = state.allData.find(i => i.id === id);
    if (!inv) return;

    if (!btn || ["view", "print", "return-flow"].includes(btn.dataset.action)) {
      try {
        const response = await api.get(`/api/v1/invoices/${encodeURIComponent(id)}`);
        inv = normalizeInvoice(response?.invoice || response?.data || response);
        state.allData = state.allData.map(item => item.id === id ? inv : item);
      } catch (error) { showToast(error.message, "error"); return; }
    }

    if (!btn || btn.dataset.action === "view") openDetailModal(inv);
    if (btn && btn.dataset.action === "print") printSingleInvoice(inv);
    if (btn && btn.dataset.action === "return-flow") openReturnFlow(inv);
  });

  els.invoicesTbody.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest("tr[data-invoice-id]");
    if (!row) return;
    e.preventDefault();
    const inv = state.allData.find(item => item.id === row.dataset.invoiceId);
    if (inv) openDetailModal(inv);
  });

  /* ------------------------------------------------------------------ */
  /* 13) تدفق الاسترجاع والاستبدال                                      */
  /* ------------------------------------------------------------------ */
  const TAX_RATE = 0.15;
  const RETURN_NAMES = [
    ["قميص قطني فاخر - أزرق", "LXT-001-BL"],
    ["حزام جلد طبيعي - بني", "LXT-084-BR"],
    ["أزرار أكمام فضية", "LXT-012-SL"],
  ];
  const REPLACEMENT_MOCK = [
    { id: "rp-1", name: "جلابية ملكي صوف", sku: "102234", price: 350, category: "جلابيب" },
    { id: "rp-2", name: "جلابية كلاسيك قطن", sku: "102235", price: 245, category: "جلابيب" },
    { id: "rp-3", name: "جلابية شتوية ثقيلة", sku: "102236", price: 420, category: "جلابيب" },
    { id: "rp-4", name: "طقم ملابس داخلية", sku: "204551", price: 85, category: "ملابس داخلية" },
    { id: "rp-5", name: "شماغ ديسار ملكي", sku: "300112", price: 210, category: "أشمغة وغتر" },
    { id: "rp-6", name: "عطر العود الكمبودي", sku: "400856", price: 550, category: "عطور" },
  ];

  function buildReturnItems(inv) {
    const invoiceItems = inv.items || [];
    if (invoiceItems.length) return invoiceItems.map((item, index) => ({
      id: String(item.id || item.invoice_item_id),
      name: item.product_name || item.name || item.product?.name || "منتج",
      sku: item.sku || item.variant?.sku || "—",
      soldQty: Number(item.quantity || item.qty || 1), qty: 0,
      price: Number(item.unit_price || item.price || item.sale_price || 0), selected: false,
      variantId: item.variant_id || item.variant?.id || null,
      version: Number(item.version || item.variant?.version || 1)
    }));
    const subtotal = Number(inv.total) / (1 + TAX_RATE);
    const weights = [0.4, 0.35, 0.25];
    return RETURN_NAMES.map((entry, index) => {
      const soldQty = index === 0 ? 2 : index === 1 ? 1 : 3;
      return {
        id: `${inv.id}-${index + 1}`,
        name: entry[0],
        sku: entry[1],
        soldQty,
        qty: 0,
        price: Number((subtotal * weights[index] / soldQty).toFixed(2)),
        selected: false,
      };
    });
  }

  function getSelectedReturnItems() {
    return state.returnItems.filter(item => item.selected && item.qty > 0);
  }

  function getReturnTotals() {
    const subtotal = getSelectedReturnItems().reduce((sum, item) => sum + item.price * item.qty, 0);
    const tax = subtotal * TAX_RATE;
    return { subtotal, tax, total: subtotal + tax };
  }

  function getExchangeTotal() {
    return state.exchangeCart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }

  function setFlowHeading(title) {
    els.returnFlowTitle.textContent = title;
    els.returnFlowInvoiceNo.textContent = state.currentInvoice ? `رقم الفاتورة: #${state.currentInvoice.id}` : "";
  }

  async function openReturnFlow(inv) {
    state.currentInvoice = inv;
    state.returnStep = "select";
    state.returnItems = buildReturnItems(inv);
    state.replacementProducts = [];
    state.exchangeCart = [];
    state.refundMethod = "store-credit";
    state.paymentMethod = "cash";
    state.exchangeCategory = "الكل";
    state.exchangeQuery = "";
    els.returnFlowOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    renderReturnFlow();
    try {
      const response = await api.get("/api/v1/products", { query: { page: 1, page_size: 100 } });
      state.replacementProducts = listFrom(response).flatMap(product => (product.variants || product.product_variants || [product]).map(variant => ({ id: String(variant.id), name: product.name_ar || product.name || variant.name || "منتج", sku: variant.sku || product.sku || "—", price: Number(variant.sale_price ?? product.sale_price ?? 0), category: product.category?.name || product.category_name || "أخرى", version: Number(variant.version || 1) }))).filter(item => item.id);
    } catch (error) { showToast(error.message, "error"); }
  }

  async function submitReturn() {
    const reason = document.getElementById("returnReason")?.value;
    if (!reason) { showToast("اختر سبب الإرجاع", "error"); return; }
    const created = await api.post("/api/v1/returns", { original_invoice_id: state.currentInvoice.id, items: getSelectedReturnItems().map(item => ({ invoice_item_id: item.id, qty: item.qty })), reason, refund_method: state.refundMethod === "store-credit" ? "exchange_credit" : "cash", idempotency_key: crypto.randomUUID() });
    const returnId = created?.id || created?.return?.id || created?.data?.id;
    if (returnId) await api.get(`/api/v1/returns/${encodeURIComponent(returnId)}`);
    state.returnStep = "success"; renderReturnFlow(); await loadData();
  }

  async function submitExchange() {
    const shift = await api.get("/api/v1/shifts/current");
    const difference = getExchangeTotal() - getReturnTotals().total;
    const created = await api.post("/api/v1/exchanges", { original_invoice_id: state.currentInvoice.id, returned_items: getSelectedReturnItems().map(item => ({ invoice_item_id: item.id, qty: item.qty })), new_items: state.exchangeCart.map(item => ({ variant_id: item.id, qty: item.qty, expected_version: item.version })), sales_person_id: state.currentInvoice.sales_person_id || state.currentInvoice.sales_person?.id, settlement_method: state.paymentMethod === "mixed" ? "cash" : state.paymentMethod, cash_amount: state.paymentMethod === "cash" ? Math.max(0, difference) : 0, card_amount: state.paymentMethod === "card" ? Math.max(0, difference) : 0, shift_id: shift?.id || shift?.shift?.id || shift?.data?.id, idempotency_key: crypto.randomUUID() });
    const exchangeId = created?.id || created?.exchange?.id || created?.data?.id;
    if (exchangeId) await api.get(`/api/v1/exchanges/${encodeURIComponent(exchangeId)}`);
    state.returnStep = "success"; renderReturnFlow(); await loadData();
  }

  function closeReturnFlow() {
    els.returnFlowOverlay.hidden = true;
    document.body.style.overflow = "";
    state.currentInvoice = null;
  }

  function renderReturnFlow() {
    els.returnFlowOverlay.dataset.step = state.returnStep;
    if (state.returnStep === "select") renderReturnSelection();
    if (state.returnStep === "manage") renderReturnManagement();
    if (state.returnStep === "exchange") renderExchangePicker();
    if (state.returnStep === "summary") renderExchangeSummary();
    if (state.returnStep === "success") renderFlowSuccess();
  }

  function renderReturnSelection() {
    setFlowHeading("اختيار عناصر المرتجع");
    const { total } = getReturnTotals();
    const count = getSelectedReturnItems().reduce((sum, item) => sum + item.qty, 0);
    els.returnFlowBody.innerHTML = `
      <div class="return-select">
        <p class="return-hint">حدد المنتجات التي يرغب العميل في إرجاعها والكمية المناسبة:</p>
        <div class="return-table">
          <div class="return-row return-row--head"><span>المنتج</span><span>الكمية المباعة</span><span>الكمية المرتجعة</span><span>الإجمالي</span></div>
          ${state.returnItems.map(item => `
            <div class="return-row${item.selected ? " is-selected" : ""}" data-return-id="${item.id}">
              <label class="return-product">
                <input type="checkbox" data-flow-action="toggle-return" ${item.selected ? "checked" : ""} />
                <span>${escapeHtml(item.name)}<small>SKU: ${escapeHtml(item.sku)}</small></span>
              </label>
              <span class="num">${item.soldQty}</span>
              <div class="return-stepper">
                <button type="button" data-flow-action="return-dec" ${!item.selected || item.qty <= 1 ? "disabled" : ""}>−</button>
                <span class="num">${item.qty}</span>
                <button type="button" data-flow-action="return-inc" ${!item.selected || item.qty >= item.soldQty ? "disabled" : ""}>+</button>
              </div>
              <span class="return-price num">${formatMoney(item.price * item.qty)} ج.م</span>
            </div>`).join("")}
        </div>
        <div class="return-footer">
          <div class="return-total"><span>إجمالي القطع المرتجعة: <b class="num">${count}</b></span><strong class="num">${formatMoney(total)} ج.م</strong></div>
          <div class="return-actions"><button class="btn btn-outline" type="button" data-flow-action="cancel">إلغاء العملية</button><button class="btn btn-primary" type="button" data-flow-action="to-manage" ${count === 0 ? "disabled" : ""}>تأكيد العناصر</button></div>
        </div>
      </div>`;
  }

  function renderReturnManagement() {
    setFlowHeading("إدارة المرتجعات");
    const { subtotal, tax, total } = getReturnTotals();
    els.returnFlowBody.innerHTML = `
      <div class="return-manage">
        <div class="return-manage__products">
          <h3>تحديد المنتجات المرتجعة</h3>
          ${getSelectedReturnItems().map(item => `<div class="return-selected-card is-selected"><span>${escapeHtml(item.name)}<small>SKU: ${escapeHtml(item.sku)}</small></span><span class="num">${item.qty} قطعة</span><strong class="return-price num">${formatMoney(item.price * item.qty)} ج.م</strong></div>`).join("")}
        </div>
        <div class="return-manage__options">
          <label class="return-reason"><span>سبب الإرجاع</span><select class="input" id="returnReason"><option value="">اختر السبب...</option><option>مقاس غير مناسب</option><option>عيب في المنتج</option><option>تغيير الرغبة</option></select></label>
          <h3>طريقة استرداد المبلغ</h3>
          <div class="refund-method">
            ${refundOption("cash", "نقدًا (Cash)", "إرجاع المبلغ فورًا من الصندوق")}
            ${refundOption("store-credit", "رصيد متجر (Store Credit)", "إضافة المبلغ لمحفظة العميل")}
            ${refundOption("exchange", "استبدال (Exchange)", "اختيار منتجات بديلة بنفس القيمة")}
          </div>
          <div class="return-breakdown"><div><span>المنتجات المرتجعة</span><span class="num">${formatMoney(subtotal)} ج.م</span></div><div><span>ضريبة القيمة المضافة (15%)</span><span class="num">${formatMoney(tax)} ج.م</span></div><div class="return-breakdown__total"><span>إجمالي المسترد</span><span class="num">${formatMoney(total)} ج.م</span></div></div>
          <div class="return-actions"><button class="btn btn-outline" type="button" data-flow-action="back-select">رجوع</button><button class="btn btn-primary" type="button" data-flow-action="confirm-return">${state.refundMethod === "exchange" ? "متابعة الاستبدال" : "تأكيد المرتجع"}</button></div>
        </div>
      </div>`;
  }

  function refundOption(value, title, hint) {
    return `<label class="refund-option${state.refundMethod === value ? " is-active" : ""}"><input type="radio" name="refundMethod" value="${value}" data-flow-action="refund-method" ${state.refundMethod === value ? "checked" : ""}><span><strong>${title}</strong><small>${hint}</small></span><span>↔</span></label>`;
  }

  function renderExchangePicker() {
    setFlowHeading("اختيار المنتجات البديلة");
    const total = getExchangeTotal();
    const visibleProducts = state.replacementProducts.filter(product => {
      const matchesCategory = state.exchangeCategory === "الكل" || product.category === state.exchangeCategory;
      const query = state.exchangeQuery.trim().toLowerCase();
      const matchesQuery = !query || product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
    els.returnFlowBody.innerHTML = `
      <div class="exchange-picker">
        <aside class="exchange-cart"><div class="exchange-cart__header"><h3>سلة الاستبدال</h3><span>${state.exchangeCart.reduce((sum, item) => sum + item.qty, 0)} عناصر</span></div><div class="exchange-cart__list">${state.exchangeCart.length ? state.exchangeCart.map(item => `<div class="exchange-cart__item" data-exchange-id="${item.id}"><strong>${escapeHtml(item.name)}</strong><div><span class="return-stepper"><button data-flow-action="exchange-dec">−</button><span>${item.qty}</span><button data-flow-action="exchange-inc">+</button></span><span class="return-price num">${formatMoney(item.price * item.qty)} ج.م</span></div></div>`).join("") : '<p class="return-hint">لم يتم اختيار منتجات بديلة بعد.</p>'}</div><div class="return-breakdown"><div><span>الإجمالي</span><strong class="return-price num">${formatMoney(total)} ج.م</strong></div></div><button class="btn btn-primary exchange-next" data-flow-action="to-summary" ${state.exchangeCart.length === 0 ? "disabled" : ""}>التالي</button></aside>
        <main class="exchange-products">${visibleProducts.length ? visibleProducts.map(product => `<button class="product-card exchange-product" type="button" data-flow-action="add-exchange" data-product-id="${product.id}"><div class="product-card__badges"><span class="product-card__badge-stock">المخزون: متاح</span><span class="product-card__badge-size">${escapeHtml(product.category)}</span></div><strong class="product-card__name">${escapeHtml(product.name)}</strong><small>كود: ${escapeHtml(product.sku)}</small><div class="product-card__footer"><span class="product-card__price num">${formatMoney(product.price)} <small>ج.م</small></span></div></button>`).join("") : '<p class="return-hint">لا توجد منتجات مطابقة.</p>'}</main>
        <aside class="exchange-categories"><input class="input" id="exchangeSearch" value="${escapeHtml(state.exchangeQuery)}" placeholder="بحث عن منتج...">${["الكل", "جلابيب", "ملابس داخلية", "أشمغة وغتر", "عطور"].map(category => `<button class="exchange-category${state.exchangeCategory === category ? " is-active" : ""}" data-flow-action="exchange-category" data-category="${category}" type="button">${category}</button>`).join("")}</aside>
      </div>`;
  }

  function renderExchangeSummary() {
    setFlowHeading("ملخص عملية الاستبدال");
    const returnTotal = getReturnTotals().total;
    const exchangeTotal = getExchangeTotal();
    const difference = exchangeTotal - returnTotal;
    els.returnFlowBody.innerHTML = `
      <div class="exchange-summary">
        <div class="exchange-summary__columns">
          <section class="exchange-card"><h3>المنتجات المرتجعة</h3>${getSelectedReturnItems().map(item => `<div class="exchange-summary-row"><span>${escapeHtml(item.name)} × ${item.qty}</span><span class="num">${formatMoney(item.price * item.qty * (1 + TAX_RATE))} ج.م</span></div>`).join("")}<div class="return-breakdown__total">إجمالي المرتجعات: <span class="num">${formatMoney(returnTotal)} ج.م</span></div></section>
          <section class="exchange-card"><h3>المنتجات البديلة</h3>${state.exchangeCart.map(item => `<div class="exchange-summary-row"><span>${escapeHtml(item.name)} × ${item.qty}</span><span class="num">${formatMoney(item.price * item.qty)} ج.م</span></div>`).join("")}<div class="return-breakdown__total">إجمالي البدائل: <span class="num">${formatMoney(exchangeTotal)} ج.م</span></div></section>
        </div>
        <section class="difference-card"><div><span>${difference >= 0 ? "الفرق المستحق للدفع" : "الفرق المستحق للعميل"}</span><strong class="difference-value num">${formatMoney(Math.abs(difference))} ج.م</strong></div>${difference > 0 ? `<p>اختر طريقة تحصيل الفارق:</p><div class="payment-options">${paymentOption("cash", "نقدي")}${paymentOption("card", "بطاقة")}${paymentOption("mixed", "دفع مختلط")}</div>` : ""}</section>
        <div class="return-footer"><span>حالة العملية: بانتظار التأكيد</span><div class="return-actions"><button class="btn btn-outline" data-flow-action="back-exchange">رجوع</button><button class="btn btn-primary" data-flow-action="finish-exchange">تأكيد الاستبدال وإنهاء</button></div></div>
      </div>`;
  }

  function paymentOption(value, label) {
    return `<button class="payment-option${state.paymentMethod === value ? " is-active" : ""}" type="button" data-flow-action="payment-method" data-value="${value}">${label}</button>`;
  }

  function renderFlowSuccess() {
    const isExchange = state.refundMethod === "exchange";
    const returnTotal = getReturnTotals().total;
    const exchangeTotal = getExchangeTotal();
    setFlowHeading(isExchange ? "نجاح عملية الاستبدال" : "نجاح عملية المرتجع");
    els.returnFlowBody.innerHTML = `<div class="flow-success"><div class="flow-success__icon">✓</div><h3>${isExchange ? "تم تنفيذ الاستبدال بنجاح" : "تم تنفيذ المرتجع بنجاح"}</h3><p>تمت معالجة الطلب وتحديث المخزون</p><div class="flow-success__details"><div><span>${isExchange ? "رقم حركة الاستبدال" : "رقم إيصال المرتجع"}</span><strong class="num">#${isExchange ? "EXC" : "RET"}-${Date.now().toString().slice(-5)}</strong></div><div><span>${isExchange ? "صافي الفارق" : "المبلغ المسترد"}</span><strong class="num">${formatMoney(isExchange ? Math.abs(exchangeTotal - returnTotal) : returnTotal)} ج.م</strong></div></div><div class="flow-success__actions"><button class="btn btn-primary" data-flow-action="print-return">${isExchange ? "طباعة إيصال الاستبدال" : "طباعة إيصال المرتجع"}</button><button class="btn btn-outline" data-flow-action="close-success">إغلاق النافذة</button></div></div>`;
  }

  function printReturnReceipt() {
    const isExchange = state.refundMethod === "exchange";
    const returnTotal = getReturnTotals().total;
    const exchangeTotal = getExchangeTotal();
    if (window.GhaithPrint) {
      window.GhaithPrint.printReceipt({title:isExchange?"إيصال استبدال":"إيصال مرتجع",number:`${isExchange?"EXC":"RET"}-${Date.now().toString().slice(-5)}`,customer:state.currentInvoice.customer,note:`الفاتورة الأصلية: ${state.currentInvoice.id}`,items:getSelectedReturnItems().map(item=>({name:item.name,sku:item.sku,qty:item.qty,price:item.price})),totals:[{label:"قيمة المرتجعات",value:returnTotal},...(isExchange?[{label:"قيمة البدائل",value:exchangeTotal},{label:"صافي الفارق",value:Math.abs(exchangeTotal-returnTotal),final:true}]:[{label:"المبلغ المسترد",value:returnTotal,final:true}])]});
      return;
    }
    els.printArea.innerHTML = `<div class="receipt"><div class="r-header"><h2>غيث للزي الاسلامي الراقي</h2><p class="r-sub">إيصال ${isExchange ? "استبدال" : "مرتجع"}</p><p>الفاتورة الأصلية: ${escapeHtml(state.currentInvoice.id)}</p></div><div class="r-totals"><div class="r-row"><span>قيمة المرتجعات:</span><span>${formatMoney(returnTotal)} ج.م</span></div>${isExchange ? `<div class="r-row"><span>قيمة البدائل:</span><span>${formatMoney(exchangeTotal)} ج.م</span></div><div class="r-row r-final"><span>صافي الفارق:</span><span>${formatMoney(Math.abs(exchangeTotal - returnTotal))} ج.م</span></div>` : `<div class="r-row r-final"><span>المبلغ المسترد:</span><span>${formatMoney(returnTotal)} ج.م</span></div>`}</div></div>`;
    window.print();
  }

  els.returnFlowBody.addEventListener("click", async event => {
    const target = event.target.closest("[data-flow-action]");
    if (!target) return;
    const action = target.dataset.flowAction;
    const returnRow = target.closest("[data-return-id]");
    const returnItem = returnRow ? state.returnItems.find(item => item.id === returnRow.dataset.returnId) : null;
    const exchangeRow = target.closest("[data-exchange-id]");
    const exchangeItem = exchangeRow ? state.exchangeCart.find(item => item.id === exchangeRow.dataset.exchangeId) : null;
    if (action === "cancel" || action === "close-success") closeReturnFlow();
    if (action === "toggle-return" && returnItem) { returnItem.selected = target.checked; returnItem.qty = target.checked ? Math.max(1, returnItem.qty) : 0; renderReturnSelection(); }
    if (action === "return-inc" && returnItem && returnItem.qty < returnItem.soldQty) { returnItem.qty++; renderReturnSelection(); }
    if (action === "return-dec" && returnItem && returnItem.qty > 1) { returnItem.qty--; renderReturnSelection(); }
    if (action === "to-manage") { state.returnStep = "manage"; renderReturnFlow(); }
    if (action === "back-select") { state.returnStep = "select"; renderReturnFlow(); }
    if (action === "confirm-return") { if (state.refundMethod === "exchange") { state.returnStep = "exchange"; renderReturnFlow(); } else { try { target.disabled = true; await submitReturn(); } catch (error) { showToast(error.message, "error"); target.disabled = false; } } }
    if (action === "add-exchange") { const product = state.replacementProducts.find(item => item.id === target.dataset.productId); const existing = state.exchangeCart.find(item => item.id === product.id); existing ? existing.qty++ : state.exchangeCart.push({ ...product, qty: 1 }); renderExchangePicker(); }
    if (action === "exchange-category") { state.exchangeCategory = target.dataset.category; renderExchangePicker(); }
    if (action === "exchange-inc" && exchangeItem) { exchangeItem.qty++; renderExchangePicker(); }
    if (action === "exchange-dec" && exchangeItem) { exchangeItem.qty--; if (exchangeItem.qty <= 0) state.exchangeCart = state.exchangeCart.filter(item => item.id !== exchangeItem.id); renderExchangePicker(); }
    if (action === "to-summary") { state.returnStep = "summary"; renderReturnFlow(); }
    if (action === "back-exchange") { state.returnStep = "exchange"; renderReturnFlow(); }
    if (action === "payment-method") { state.paymentMethod = target.dataset.value; renderExchangeSummary(); }
    if (action === "finish-exchange") { try { target.disabled = true; await submitExchange(); } catch (error) { showToast(error.message, "error"); target.disabled = false; } }
    if (action === "print-return") printReturnReceipt();
  });

  els.returnFlowBody.addEventListener("change", event => {
    if (event.target.dataset.flowAction === "refund-method") { state.refundMethod = event.target.value; renderReturnManagement(); }
  });

  els.returnFlowBody.addEventListener("input", debounce(event => {
    if (event.target.id === "exchangeSearch") { state.exchangeQuery = event.target.value; renderExchangePicker(); }
  }, 350));

  els.closeReturnFlowBtn.addEventListener("click", closeReturnFlow);
  els.returnFlowOverlay.addEventListener("click", event => { if (event.target === els.returnFlowOverlay) closeReturnFlow(); });

  /* ------------------------------------------------------------------ */
  /* 13) مودال التفاصيل                                                  */
  /* ------------------------------------------------------------------ */
  async function openDetailModal(inv) {
    state.currentInvoice = inv;
    const relatedReturn = state.returns.find(item => String(item.original_invoice_id || item.invoice_id) === String(inv.id));
    if (relatedReturn?.id) {
      try { relatedReturn.detail = await api.get(`/api/v1/returns/${encodeURIComponent(relatedReturn.id)}`); } catch { /* القائمة تكفي إذا تعذر التفصيل */ }
    }
    const { date, time } = formatDate(inv.date);
    const st = STATUS_MAP[inv.status] || { cls: "is-done", label: inv.status };
    const items = buildReturnItems(inv);
    const subtotal = Number(inv.total) / (1 + TAX_RATE);
    const tax = Number(inv.total) - subtotal;
    els.detailTitle.innerHTML = `<span>تفاصيل الفاتورة <b class="num">#${escapeHtml(inv.id)}</b></span><span class="inv-detail-status">${escapeHtml(st.label)}</span>`;

    els.detailBody.innerHTML = `
      <div class="invoice-detail-layout">
        <aside class="invoice-detail-side">
          <section class="detail-summary-card">
            <h3>ملخص الحساب</h3>
            <div><span>المجموع الفرعي:</span><span class="num">${formatMoney(subtotal)} ج.م</span></div>
            <div><span>الخصم:</span><span class="num detail-danger">0.00- ج.م</span></div>
            <div><span>ضريبة القيمة المضافة (15%):</span><span class="num">${formatMoney(tax)} ج.م</span></div>
            <div class="detail-summary-total"><span>الإجمالي:</span><strong class="num">${formatMoney(inv.total)}</strong></div>
          </section>
          <div class="detail-action-grid">
            <button type="button" data-detail-action="print"><span>▣</span>طباعة الفاتورة</button>
            <button type="button" data-detail-action="return"><span>↵</span>إرجاع أصناف</button>
            <button type="button" data-detail-action="exchange"><span>↔</span>استبدال</button>
            <button type="button"><span>▤</span>إرسال واتساب</button>
          </div>
          <button class="detail-wide-action" type="button">◷ عرض سجل التحديثات</button>
          <button class="detail-wide-action" type="button">▣ ملاحظات الفاتورة</button>
        </aside>
        <main class="invoice-detail-main">
          <div class="detail-info-grid">
            <section class="detail-info-card"><h3>بيانات العميل</h3><div><span>الاسم:</span><strong>${escapeHtml(inv.customer)}</strong></div><div><span>الجوال:</span><strong class="num">${escapeHtml(inv.phone || "—")}</strong></div><div><span>العنوان:</span><strong>الرياض، حي النرجس</strong></div><div><span>الفئة:</span><em>عميل نقدي</em></div></section>
            <section class="detail-info-card"><h3>بيانات الفاتورة</h3><div><span>التاريخ:</span><strong>${escapeHtml(date)}</strong></div><div><span>الوقت:</span><strong>${escapeHtml(time)}</strong></div><div><span>الكاشير:</span><strong>${escapeHtml(inv.cashier)}</strong></div><div><span>السيلز:</span><strong>${escapeHtml(inv.sales || "—")}</strong></div><div><span>طريقة الدفع:</span><strong>${escapeHtml(inv.payment_method)}</strong></div></section>
          </div>
          <div class="detail-products-table"><div class="detail-product-row is-head"><span>المنتج</span><span>التصنيف</span><span>المواصفات</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span></div>${items.map((item, index) => `<div class="detail-product-row"><span>${escapeHtml(item.name)}</span><span>${index === 2 ? "إكسسوارات" : "أزياء رجالية"}</span><span>${index === 0 ? "مقاس L | أزرق" : "قياسي"}</span><span class="num">${item.soldQty}</span><span class="num">${formatMoney(item.price)}</span><span class="num">${formatMoney(item.price * item.soldQty)}</span></div>`).join("")}</div>
          <section class="related-operations"><h3>العمليات المرتبطة</h3><div class="related-operations__list"><article class="related-operation is-original"><span>الفاتورة الأصلية</span><strong class="num">#${escapeHtml(inv.id)}</strong><small>${escapeHtml(date)} | ${escapeHtml(inv.cashier)}</small></article><article class="related-operation"><span>لا توجد مرتجعات مرتبطة</span><strong>—</strong><small>حتى الآن</small></article><article class="related-operation is-exchange"><span>استبدال</span><strong>جاهز للتنفيذ</strong><small>من إجراءات الفاتورة</small></article></div></section>
        </main>
      </div>
    `;

    els.detailOverlay.style.display = "flex";
  }

  function closeDetailModal() {
    els.detailOverlay.style.display = "none";
    state.currentInvoice = null;
  }

  els.closeDetailBtn.addEventListener("click", closeDetailModal);
  els.closeDetailOkBtn.addEventListener("click", closeDetailModal);
  els.detailOverlay.addEventListener("click", e => {
    if (e.target === els.detailOverlay) closeDetailModal();
  });

  els.printDetailBtn.addEventListener("click", () => {
    if (state.currentInvoice) printSingleInvoice(state.currentInvoice);
  });

  els.detailBody.addEventListener("click", event => {
    const button = event.target.closest("[data-detail-action]");
    if (!button || !state.currentInvoice) return;
    const inv = state.currentInvoice;
    if (button.dataset.detailAction === "print") printSingleInvoice(inv);
    if (button.dataset.detailAction === "return" || button.dataset.detailAction === "exchange") {
      els.detailOverlay.style.display = "none";
      openReturnFlow(inv);
      if (button.dataset.detailAction === "exchange") state.refundMethod = "exchange";
    }
  });

  /* ------------------------------------------------------------------ */
  /* 14) طباعة فاتورة واحدة                                              */
  /* ------------------------------------------------------------------ */
  function printSingleInvoice(inv) {
    const { date, time } = formatDate(inv.date);
    const st = STATUS_MAP[inv.status] || { cls: "", label: inv.status };
    if (window.GhaithPrint) {
      window.GhaithPrint.printReceipt({
        title: st.label === "مرتجع" ? "إيصال مرتجع" : "فاتورة مبيعات",
        number: inv.id,
        date,
        time,
        customer: inv.customer,
        cashier: inv.cashier,
        sales: inv.sales || "—",
        payment: inv.payment_method,
        items: (inv.items || buildReturnItems(inv)).map(item => ({ name: item.name, sku: item.sku, qty: item.qty || item.quantity || item.soldQty || 1, price: item.price || 0 })),
        totals: [
          ...(Number(inv.discount) ? [{ label: "الخصم", value: inv.discount, negative: true }] : []),
          { label: "الإجمالي", value: inv.total, final: true }
        ],
        note: `الحالة: ${st.label}`
      });
      return;
    }
    els.printArea.innerHTML = `
      <div class="receipt">
        <div class="r-header">
          <h2>غيث للزي الاسلامي الراقي</h2>
          <p class="r-sub">فاتورة مبيعات</p>
          <p class="r-date">${escapeHtml(date)} — ${escapeHtml(time)} | رقم: ${escapeHtml(inv.id)}</p>
        </div>
        <div class="r-totals">
          <div class="r-row"><span>العميل:</span><span>${escapeHtml(inv.customer)}</span></div>
          <div class="r-row"><span>الكاشير:</span><span>${escapeHtml(inv.cashier)}</span></div>
          <div class="r-row"><span>السيلز:</span><span>${escapeHtml(inv.sales || "—")}</span></div>
          <div class="r-row"><span>طريقة الدفع:</span><span>${escapeHtml(inv.payment_method)}</span></div>
          <div class="r-row"><span>الحالة:</span><span>${escapeHtml(st.label)}</span></div>
          <div class="r-row r-final"><span>الإجمالي:</span><span>${formatMoney(inv.total)} ج.م</span></div>
        </div>
        <div class="r-footer">
          <p>شكراً لزيارتكم ❤</p>
        </div>
      </div>
    `;
    window.print();
  }

  /* ------------------------------------------------------------------ */
  /* 15) زرار فاتورة جديدة — إعادة التوجيه لصفحة POS                    */
  /* ------------------------------------------------------------------ */
  document.getElementById("newInvoiceBtn").addEventListener("click", () => {
    window.location.href = document.documentElement.dataset.cashierSpa === "true" ? "#pos" : "../cashier.html#pos";
  });

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */
  loadData();
})();
