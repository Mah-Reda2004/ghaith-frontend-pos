// ==========================================================================
// سجل الفواتير — منطق كامل: تحميل البيانات، فلاتر، Pagination، مودال التفاصيل، طباعة
// البيانات تُحمّل من API الفواتير الحالي.
// ==========================================================================

import { api, idempotencyKey, listFrom } from "../../../core/api.js";
import { debounce, formatMoney } from "../../../core/utils.js";

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
    returnFlowBackBtn: document.getElementById("returnFlowBackBtn"),
  };

  /* ------------------------------------------------------------------ */
  /* 3) الحالة (State)                                                   */
  /* ------------------------------------------------------------------ */
  const state = {
    page: 1,
    pageSize: 10,
    filters: {},
    allData: [],
    allInvoices: [],
    returnOperations: [],
    total: 0,
    operations: [],
    currentInvoice: null,
    returnStep: "select",
    returnItems: [],
    replacementProducts: [],
    replacementCategories: [],
    exchangeCart: [],
    refundMethod: "store-credit",
    returnReason: "",
    paymentMethod: "cash",
    exchangeCategory: "الكل",
    exchangeQuery: "",
    exchangeVariantKey: "",
    exchangeVariantSize: "",
    replacementStatus: "idle",
    replacementError: "",
    replacementRequestId: 0,
    replacementPage: 1,
    replacementHasMore: false,
    exchangeCartOpen: false,
    currentShift: null,
    usersById: new Map(),
    customersById: new Map(),
    variantsById: new Map(),
    customerTypesById: new Map(),
    referenceDataPromise: null,
    lastOperation: null,
    lastOperationType: "",
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

  function formatDate(iso) {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return { date, time };
  }

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
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
    "مكتملة": { cls: "is-done", label: "مكتملة" },
    "مدفوعة": { cls: "is-paid", label: "مدفوعة" },
    "قيد الدفع": { cls: "is-pending", label: "قيد الدفع" },
    "مدفوعة جزئيًا": { cls: "is-partially-paid", label: "مدفوعة جزئيًا" },
    "غير مدفوعة": { cls: "is-unpaid", label: "غير مدفوعة" },
    "آجل": { cls: "is-debt", label: "آجل" },
    "مسودة": { cls: "is-draft", label: "مسودة" },
    "ملغاة": { cls: "is-cancel", label: "ملغاة" },
    "مرتجع": { cls: "is-returned", label: "مرتجع" },
    "مرتجع جزئيًا": { cls: "is-partially-returned", label: "مرتجع جزئيًا" },
    "مرتجع بالكامل": { cls: "is-fully-returned", label: "مرتجع بالكامل" },
    "مستبدلة": { cls: "is-exchanged", label: "مستبدلة" },
    "مستبدلة جزئيًا": { cls: "is-partially-exchanged", label: "مستبدلة جزئيًا" },
  };

  const METHOD_ICONS = {
    "نقدي":    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>`,
    "محفظة":   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><circle cx="16" cy="14" r="1"/></svg>`,
    "فيزا":    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>`,
    "تحويل":   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>`,
    "آجل":     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  };
  const STATUS_LABELS = {
    completed: "مكتملة", paid: "مدفوعة", pending: "قيد الدفع", pending_payment: "قيد الدفع",
    partially_paid: "مدفوعة جزئيًا", unpaid: "غير مدفوعة", deferred: "آجل", draft: "مسودة",
    cancelled: "ملغاة", canceled: "ملغاة", void: "ملغاة", refunded: "مرتجع",
    partially_refunded: "مرتجع جزئيًا", returned: "مرتجع", partially_returned: "مرتجع جزئيًا",
    fully_returned: "مرتجع بالكامل", exchanged: "مستبدلة", partially_exchanged: "مستبدلة جزئيًا"
  };
  const PAYMENT_LABELS = {
    cash: "نقدي", wallet: "محفظة", card: "فيزا", visa: "فيزا", credit_card: "فيزا",
    debit_card: "فيزا", transfer: "محفظة إلكترونية", bank: "تحويل بنكي", bank_transfer: "تحويل بنكي",
    instapay: "تحويل إنستاباي", deferred: "آجل", credit: "آجل", mixed: "دفع مختلط",
    store_credit: "رصيد متجر", exchange_credit: "رصيد استبدال", exchange: "استبدال"
  };
  const REFUND_LABELS = { cash: "نقدي", store_credit: "رصيد متجر", exchange_credit: "رصيد استبدال", exchange: "استبدال" };

  function invoiceItems(item) {
    return item.items || item.invoice_items || item.sale_items || item.lines || [];
  }

  function invoiceItemCount(item, items = invoiceItems(item)) {
    const explicit = item.items_count ?? item.item_count ?? item.products_count ?? item.total_items ?? item.total_quantity;
    if (explicit !== undefined && explicit !== null) return Number(explicit) || 0;
    return items.reduce((total, line) => total + Number(line.quantity ?? line.qty ?? 1), 0);
  }

  function invoiceItemSpecifications(item) {
    const variantId = String(item.variant_id || item.product_variant_id || item.variant?.id || item.product_variant?.id || "");
    const nestedVariants = item.product_variants || item.product?.product_variants || item.product?.variants || [];
    const nestedVariant = Array.isArray(nestedVariants) ? nestedVariants.find(entry => String(entry.id || entry.variant_id) === variantId) || nestedVariants[0] || {} : nestedVariants;
    const variant = item.product_variant || item.variant || nestedVariant || {};
    const size = item.size || item.variant_size || item.product_size || item.size_name || variant.size || variant.variant_size || variant.size_name;
    const color = item.color || item.variant_color || item.product_color || item.color_name || variant.color || variant.variant_color || variant.color_name;
    return [size && `المقاس: ${size}`, color && `اللون: ${color}`].filter(Boolean).join(" | ") || item.sku || variant.sku || "—";
  }

  function operationInvoiceReference(operation) {
    const linkedInvoice = operation.invoice || operation.return_invoice || operation.exchange_invoice || {};
    const type = operationType(operation);
    const operationNumber = operation.return_number || operation.exchange_number || operation.operation_number || operation.number || operation.return_invoice_number || operation.exchange_invoice_number;
    if (operationNumber) return { label: type === "exchange" ? "رقم الاستبدال" : "رقم المرتجع", value: operationNumber };
    const barcode = operation.return_invoice_barcode || operation.exchange_invoice_barcode || operation.invoice_barcode || operation.operation_barcode || operation.barcode || operation.reference_barcode || linkedInvoice.barcode;
    return { label: barcode ? "باركود العملية" : type === "exchange" ? "رقم الاستبدال" : "رقم المرتجع", value: barcode || "—" };
  }

  function operationReferenceValue(operation) {
    return String(operationInvoiceReference(operation).value || "");
  }

  function operationOriginalInvoiceId(operation) {
    const original = operation.original_invoice || operation.sales_invoice || operation.invoice || {};
    return String(operation.original_invoice_id || operation.sales_invoice_id || operation.invoice_id || original.id || "");
  }

  async function loadReturnOperations() {
    try {
      const first = await api.get("/api/v1/returns", { query: { page: 1, page_size: 100 } });
      const pages = [first];
      const firstItems = listFrom(first);
      const total = Number(first?.total ?? first?.data?.total ?? firstItems.length);
      for (let page = 2; page <= Math.ceil(total / 100); page += 1) {
        pages.push(await api.get("/api/v1/returns", { query: { page, page_size: 100 } }));
      }
      state.returnOperations = pages.flatMap(listFrom).map(operation => ({ ...operation, type: "return" }));
    } catch {
      // يظل سجل فواتير البيع متاحًا حتى لو تعذر تحميل قائمة المرتجعات.
      state.returnOperations = [];
    }
    return state.returnOperations;
  }

  function operationType(operation) {
    const rawType = normalizeEnumKey(operation.type || operation.operation_type || operation.kind || "");
    const reference = String(operation.number || operation.return_number || operation.exchange_number || "").toUpperCase();
    return rawType.includes("exchange") || reference.startsWith("EXC") ? "exchange" : "return";
  }

  function operationId(operation, type = operationType(operation)) {
    return operation[`${type}_id`] || operation.operation_id || operation.reference_id || operation.id;
  }

  function operationItems(operation, kind = "return") {
    const keys = kind === "replacement"
      ? ["replacement_items", "replacements", "new_items", "exchange_items", "received_items"]
      : ["return_items", "returned_items", "refund_items"];
    for (const key of keys) if (Array.isArray(operation?.[key])) return operation[key];
    return [];
  }

  function operationItemQuantity(item) {
    return Number(item?.quantity ?? item?.qty ?? item?.returned_quantity ?? item?.replacement_quantity ?? 1) || 0;
  }

  function operationItemInvoiceId(item) {
    return String(item?.invoice_item_id || item?.sale_item_id || item?.original_item_id || item?.line_id || item?.id || "");
  }

  function operationItemVariantId(item) {
    return String(item?.variant_id || item?.product_variant_id || item?.variant?.id || item?.product_variant?.id || "");
  }

  function operationItemName(item) {
    const variant = state.variantsById.get(operationItemVariantId(item)) || {};
    return item?.product_name || item?.name || item?.product?.name_ar || item?.product?.name || item?.variant?.product_name || variant.name || variant.name_ar || variant.product?.name_ar || variant.product?.name || "منتج بديل";
  }

  function operationItemSku(item) {
    const variant = state.variantsById.get(operationItemVariantId(item)) || {};
    return item?.sku || item?.variant?.sku || item?.product_variant?.sku || variant.sku || "";
  }

  function returnedQuantityForItem(item, operations = state.operations) {
    const explicit = item.returned_quantity ?? item.refunded_quantity ?? item.returned_qty ?? item.refunded_qty;
    if (explicit !== undefined && explicit !== null) return Math.max(0, Number(explicit) || 0);
    const id = String(item.id || item.invoice_item_id || item.sale_item_id || "");
    if (!id) return 0;
    return operations.reduce((total, operation) => total + operationItems(operation, "return")
      .filter(line => operationItemInvoiceId(line) === id)
      .reduce((sum, line) => sum + operationItemQuantity(line), 0), 0);
  }

  function replacementItemsFromOperations(operations = state.operations) {
    return operations.flatMap(operation => operationType(operation) === "exchange" ? operationItems(operation, "replacement").map(item => ({
      name: operationItemName(item), sku: operationItemSku(item), qty: operationItemQuantity(item),
      price: Number(item.unit_price ?? item.price ?? item.sale_price ?? 0), replacement: true
    })) : []);
  }

  async function hydrateOperation(operation) {
    const type = operationType(operation);
    const id = operationId(operation, type);
    const hasLineDetails = operationItems(operation, "return").length || operationItems(operation, "replacement").length;
    if (!id || hasLineDetails) return operation;
    try {
      const response = await api.get(`/api/v1/${type === "exchange" ? "exchanges" : "returns"}/${encodeURIComponent(id)}`);
      const details = response?.[type] || response?.data || response;
      return { ...operation, ...(details && typeof details === "object" ? details : {}), type };
    } catch {
      return operation;
    }
  }

  async function loadInvoiceOperations(invoiceId, { notify = false } = {}) {
    try {
      const response = await api.get(`/api/v1/sales-invoices/${encodeURIComponent(invoiceId)}/operations`);
      const operations = Array.isArray(response?.operations) ? response.operations : listFrom(response);
      state.operations = await Promise.all(operations.map(hydrateOperation));
    } catch (error) {
      state.operations = [];
      if (notify) showToast(error.message, "error");
    }
    return state.operations;
  }

  function personName(person, ...fallbacks) {
    if (typeof person === "string") return person;
    return person?.name || person?.full_name || person?.username || fallbacks.find(Boolean) || "—";
  }

  function normalizeEnumKey(value) {
    return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  function translatedEnum(value, labels, fallback = "—") {
    if (Array.isArray(value)) {
      const translated = value.map(entry => translatedEnum(entry, labels, "")).filter(Boolean);
      return [...new Set(translated)].join(" + ") || fallback;
    }
    if (value == null || value === "") return fallback;
    return labels[normalizeEnumKey(value)] || String(value);
  }

  function invoicePaymentMethod(item) {
    const payment = item.payment || item.payment_details || item.payments?.[0] || {};
    const method = item.payment_methods ?? item.payment_method ?? item.method ?? payment.methods ?? payment.method ?? payment.payment_method;
    return translatedEnum(method, PAYMENT_LABELS);
  }

  function needsInvoiceDetails(item) {
    const customer = item.customer || {};
    const items = invoiceItems(item);
    const hasItems = items.length > 0 || [item.items_count, item.item_count, item.products_count, item.total_items, item.total_quantity].some(value => value != null);
    const hasPhone = customer.phone != null || item.customer_phone != null || item.phone != null;
    const hasCashier = item.cashier != null || item.cashier_user != null || item.created_by != null || item.cashier_name != null || item.created_by_name != null;
    const hasSales = item.sales_person != null || item.sales_user != null || item.sales != null || item.sales_person_name != null || item.sales_user_name != null || item.sales_name != null;
    const payment = item.payment || item.payment_details || item.payments?.[0] || {};
    const hasPayment = item.payment_method != null || item.method != null || payment.method != null || payment.payment_method != null;
    return !hasItems || !hasPhone || !hasCashier || !hasSales || !hasPayment;
  }

  function invoiceFromResponse(response) {
    return response?.invoice || response?.data?.invoice || response?.data?.item || response?.item || response?.data || response;
  }

  async function hydrateInvoices(invoices) {
    return Promise.all(invoices.map(async item => {
      if (!item?.id || !needsInvoiceDetails(item)) return item;
      try {
        const response = await api.get(`/api/v1/sales-invoices/${encodeURIComponent(item.id)}`);
        const details = invoiceFromResponse(response);
        return { ...item, ...details };
      } catch {
        return item;
      }
    }));
  }

  async function loadUserDirectory() {
    try {
      const first = await api.get("/api/v1/admin/users", { query: { page: 1, page_size: 100 } });
      const total = Number(first?.total ?? first?.data?.total ?? listFrom(first).length);
      const pages = [first];
      for (let page = 2; page <= Math.ceil(total / 100); page += 1) {
        pages.push(await api.get("/api/v1/admin/users", { query: { page, page_size: 100 } }));
      }
      state.usersById = new Map(pages.flatMap(listFrom).map(entry => {
        const user = entry.user || entry;
        return [String(user.id || user.user_id || entry.user_id || ""), personName(user)];
      }).filter(([id, name]) => id && name !== "—"));
    } catch {
      state.usersById = new Map();
    }
  }

  async function loadCustomerDirectory() {
    try {
      const first = await api.get("/api/v1/customers", { query: { page: 1, page_size: 100 } });
      const pages = [first], total = Number(first?.total ?? first?.data?.total ?? listFrom(first).length);
      for (let page = 2; page <= Math.ceil(total / 100); page += 1) pages.push(await api.get("/api/v1/customers", { query: { page, page_size: 100 } }));
      state.customersById = new Map(pages.flatMap(listFrom).map(customer => [String(customer.id), customer]));
    } catch { state.customersById = new Map(); }
  }

  async function loadCatalogDirectory() {
    try {
      const first = await api.get("/api/v1/pos/catalog", { query: { page: 1, page_size: 100 } });
      const pages = [first], total = Number(first?.total ?? first?.data?.total ?? listFrom(first).length);
      for (let page = 2; page <= Math.ceil(total / 100); page += 1) pages.push(await api.get("/api/v1/pos/catalog", { query: { page, page_size: 100 } }));
      const variants = pages.flatMap(listFrom).flatMap(product => (product.variants || product.product_variants || [product]).map(variant => ({
        ...variant,
        name: product.name_ar || product.name || variant.name_ar || variant.name,
        category_name: product.category?.name || product.category_name || variant.category?.name || variant.category_name,
        product
      })));
      state.variantsById = new Map(variants.map(variant => [String(variant.variant_id || variant.id), variant]));
    } catch { state.variantsById = new Map(); }
  }

  async function loadCustomerTypesDirectory() {
    try {
      const response = await api.get("/api/v1/customer-types");
      state.customerTypesById = new Map(listFrom(response).map(type => [String(type.id), type]));
    } catch { state.customerTypesById = new Map(); }
  }

  function loadReferenceData() {
    if (!state.referenceDataPromise) state.referenceDataPromise = Promise.all([loadUserDirectory(), loadCustomerDirectory(), loadCatalogDirectory(), loadCustomerTypesDirectory()]);
    return state.referenceDataPromise;
  }

  function normalizeInvoice(item) {
    const linkedCustomer = state.customersById.get(String(item.customer_id || "")) || {};
    const customer = { ...linkedCustomer, ...(typeof item.customer === "object" && item.customer ? item.customer : {}) };
    const cashier = item.cashier || item.cashier_user || item.created_by;
    const sales = item.sales_person || item.sales_user || item.sales;
    const items = invoiceItems(item).map(line => ({ ...state.variantsById.get(String(line.variant_id || line.product_variant_id || line.variant?.id || line.product_variant?.id || "")), ...line }));
    const discountRecord = typeof item.discount === "object" && item.discount ? item.discount : {};
    const customerType = customer.customer_type || state.customerTypesById.get(String(customer.customer_type_id || item.customer_type_id || "")) || {};
    const itemsSubtotal = items.reduce((sum, line) => {
      const quantity = Number(line.quantity ?? line.qty ?? 1);
      const unitPrice = Number(line.unit_price ?? line.price ?? line.sale_price ?? 0);
      return sum + (Number(line.subtotal ?? line.line_total ?? line.total) || unitPrice * quantity);
    }, 0);
    const subtotalValue = Number(item.subtotal_amount ?? item.subtotal ?? item.gross_amount ?? itemsSubtotal ?? 0);
    const totalValue = Number(item.total_amount ?? item.grand_total ?? item.net_amount ?? item.total ?? 0);
    const taxValue = Number(item.tax_amount ?? item.vat_amount ?? item.vat ?? 0);
    const explicitDiscount = Number(
      item.discount_amount ?? item.total_discount ?? item.discount_value ?? item.discountAmount ??
      discountRecord.amount ?? discountRecord.discount_amount ??
      (typeof item.discount === "number" ? item.discount : 0)
    );
    const inferredDiscount = Math.max(0, subtotalValue + taxValue - totalValue);
    const discountValue = explicitDiscount > 0 ? explicitDiscount : inferredDiscount;
    const discountType = item.discount_type || item.discount_reason || discountRecord.name || discountRecord.label || discountRecord.type;
    const customerTypePercent = Number(customerType.discount_percent ?? customerType.discount_rate ?? customerType.discount ?? 0);
    const inferredPercentage = subtotalValue > 0 ? (discountValue / subtotalValue) * 100 : 0;
    const percentageValue = Number(discountRecord.value || item.discount_percent || item.discount_rate || customerTypePercent || inferredPercentage || 0);
    const percentageText = percentageValue.toLocaleString("en-US", { maximumFractionDigits: 2 });
    const savedDiscountLabel = String(item.discount_label || "").trim();
    const discountLabel = customerType.name && customerTypePercent > 0
      ? `خصم ${customerType.name} ${percentageText}%`
      : discountType === "percentage"
        ? `خصم نسبة ${percentageText}%`
        : savedDiscountLabel || (discountType === "amount" ? "خصم مبلغ ثابت" : customerType.name ? `خصم ${customerType.name}` : discountValue > 0 ? "خصم الكاشير" : "بدون خصم");
    return {
      ...item,
      id: String(item.id),
      number: item.invoice_number || item.number || item.id,
      customer: customer.name || (typeof item.customer === "string" ? item.customer : null) || item.customer_name || "عميل نقدي",
      customerData: customer,
      phone: customer.phone || item.customer_phone || item.phone || "",
      date: item.created_at || item.invoice_date || new Date().toISOString(),
      cashier: state.usersById.get(String(item.cashier_id || item.created_by_id || cashier?.id || "")) || personName(cashier, item.cashier_name, item.created_by_name),
      cashierId: cashier?.id || item.cashier_id || item.created_by_id || "",
      sales: state.usersById.get(String(item.sales_person_id || item.sales_user_id || sales?.id || "")) || personName(sales, item.sales_person_name, item.sales_user_name, item.sales_name),
      items_count: invoiceItemCount(item, items),
      payment_method: invoicePaymentMethod(item),
      status: translatedEnum(item.status, STATUS_LABELS, "مكتملة"),
      total: totalValue,
      subtotal: subtotalValue,
      discount: discountValue,
      discountLabel,
      tax: taxValue,
      paid: Number(item.paid_amount ?? 0),
      remaining: Number(item.remaining_amount ?? 0),
      change: Number(item.change_amount ?? 0),
      currency: item.currency || "EGP",
      notes: item.notes || "",
      items
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
      const response = await api.get("/api/v1/sales-invoices", { query: { page: 1, page_size: 100 } });
      const rawInvoices = [...listFrom(response)];
      const apiTotal = Number(response?.total ?? response?.data?.total ?? rawInvoices.length);
      for (let page = 2; page <= Math.ceil(apiTotal / 100); page += 1) {
        rawInvoices.push(...listFrom(await api.get("/api/v1/sales-invoices", { query: { page, page_size: 100 } })));
      }
      await Promise.all([loadReferenceData(), loadReturnOperations()]);
      state.allInvoices = (await hydrateInvoices(rawInvoices)).map(normalizeInvoice).map(invoice => ({
        ...invoice,
        returnOperations: state.returnOperations.filter(operation => operationOriginalInvoiceId(operation) === invoice.id)
      }));
      syncCashierOptions(state.allInvoices);
      const filtered = filterInvoices(state.allInvoices);
      state.total = filtered.length;
      const start = (state.page - 1) * state.pageSize;
      state.allData = filtered.slice(start, start + state.pageSize);
      renderTable();
    } catch (e) {
      showState("error");
    }
  }

  /* ------------------------------------------------------------------ */
  /* 8) فلترة بيانات الـ API محليًا للعرض الحالي                         */
  /* ------------------------------------------------------------------ */
  function filterInvoices(invoices) {
    const f = state.filters;
    return invoices.filter(invoice => {
      if (f.invNo) {
        const invoiceNumber = String(invoice.number).toLowerCase();
        const query = f.invNo.toLowerCase();
        const queryDigits = query.replace(/\D/g, "");
        const invoiceDigits = invoiceNumber.replace(/\D/g, "");
        const returnNumbers = (invoice.returnOperations || []).map(operationReferenceValue).map(value => value.toLowerCase());
        const matchesReturn = returnNumbers.some(value => value.includes(query) || (queryDigits && value.replace(/\D/g, "").includes(queryDigits)));
        if (!invoiceNumber.includes(query) && !(queryDigits && invoiceDigits.includes(queryDigits)) && !matchesReturn) return false;
      }
      if (f.customer && !String(invoice.customer).toLowerCase().includes(f.customer.toLowerCase())) return false;
      if (f.phone && !String(invoice.phone).includes(f.phone)) return false;
      if (f.cashier && String(invoice.cashierId) !== String(f.cashier)) return false;
      if (f.method && invoice.payment_method !== f.method) return false;
      if (f.status && invoice.status !== f.status) return false;
      if (f.date && new Date(invoice.date).toISOString().slice(0, 10) !== f.date) return false;
      return true;
    });
  }

  function syncCashierOptions(invoices) {
    const selected = els.filterCashier.value;
    const known = new Map(Array.from(els.filterCashier.options).slice(1).map(option => [option.value, option.textContent]));
    invoices.forEach(invoice => { if (invoice.cashierId) known.set(invoice.cashierId, invoice.cashier); });
    els.filterCashier.innerHTML = '<option value="">الكل</option>' + Array.from(known, ([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("");
    els.filterCashier.value = selected;
  }

  /* ------------------------------------------------------------------ */
  /* 9) رسم الجدول                                                        */
  /* ------------------------------------------------------------------ */
  function renderTable() {
    const pageData = state.allData;
    const total = state.total;

    if (total === 0) { showState("empty"); return; }

    const start = (state.page - 1) * state.pageSize;

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
      const returnReferences = (inv.returnOperations || []).map(operationReferenceValue).filter(value => value && value !== "—");
      tr.innerHTML = `
        <td><span class="inv-no">#${escapeHtml(inv.number)}</span>${returnReferences.map(reference => `<span class="inv-return-no">مرتجع #${escapeHtml(reference)}</span>`).join("")}</td>
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
        <td><span class="inv-total">${formatMoney(inv.discount)}</span><small class="inv-discount-type">${escapeHtml(inv.discountLabel)}</small></td>
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
    els.paginationInfo.textContent = `عرض ${start + 1}–${Math.min(start + pageData.length, total)} من أصل ${total} فاتورة`;
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
    prev.className = "page-btn inv-page-btn--arrow";
    prev.setAttribute("aria-label", "الصفحة السابقة");
    prev.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
    prev.disabled = state.page === 1;
    prev.addEventListener("click", () => { if (state.page > 1) { state.page--; loadData(); } });
    frag.appendChild(prev);

    // Pages
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement("button");
      btn.className = "page-btn" + (i === state.page ? " is-active" : "");
      btn.textContent = i;
      btn.addEventListener("click", () => { state.page = i; loadData(); });
      frag.appendChild(btn);
    }

    // Next
    const next = document.createElement("button");
    next.className = "page-btn inv-page-btn--arrow";
    next.setAttribute("aria-label", "الصفحة التالية");
    next.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
    next.disabled = state.page === totalPages;
    next.addEventListener("click", () => { if (state.page < totalPages) { state.page++; loadData(); } });
    frag.appendChild(next);

    els.paginationPages.innerHTML = "";
    els.paginationPages.appendChild(frag);
  }

  /* ------------------------------------------------------------------ */
  /* 11) فلاتر البحث                                                     */
  /* ------------------------------------------------------------------ */
  function applyFilters() {
    state.page = 1;
    const scannedInvoiceNumber = els.filterInvNo.value.trim().replace(/^\*+|\*+$/g, "");
    if (scannedInvoiceNumber !== els.filterInvNo.value) els.filterInvNo.value = scannedInvoiceNumber;
    state.filters = {
      invNo:    scannedInvoiceNumber,
      customer: els.filterCustomer.value.trim(),
      phone:    els.filterPhone.value.trim(),
      date:     els.filterDate.value,
      cashier:  els.filterCashier.value,
      method:   els.filterMethod.value,
      status:   els.filterStatus.value,
    };
    loadData();
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
    loadData();
  }

  // Debounce على حقول النص
  const debouncedFilter = debounce(applyFilters, 350);
  [els.filterInvNo, els.filterCustomer, els.filterPhone].forEach(el => {
    el.addEventListener("input", debouncedFilter);
  });
  els.filterInvNo.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyFilters();
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
        const response = await api.get(`/api/v1/sales-invoices/${encodeURIComponent(id)}`);
        const details = invoiceFromResponse(response);
        inv = normalizeInvoice({ ...inv, ...details });
        state.allData = state.allData.map(item => item.id === id ? inv : item);
      } catch (error) { showToast(error.message, "error"); return; }
    }

    if (!btn || btn.dataset.action === "view") openDetailModal(inv);
    if (btn && btn.dataset.action === "print") { await loadInvoiceOperations(inv.id); printSingleInvoice(inv); }
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
  function buildReturnItems(inv, operations = state.operations) {
    const invoiceItems = inv.items || [];
    if (invoiceItems.length) return invoiceItems.map(item => {
      const purchasedQty = Number(item.quantity ?? item.qty ?? 1) || 0;
      const returnedQty = Math.min(purchasedQty, returnedQuantityForItem(item, operations));
      const explicitReturnable = item.returnable_quantity ?? item.available_return_quantity ?? item.remaining_returnable_quantity ?? item.remaining_quantity;
      const returnableQty = explicitReturnable !== undefined && explicitReturnable !== null
        ? Math.max(0, Math.min(purchasedQty, Number(explicitReturnable) || 0))
        : Math.max(0, purchasedQty - returnedQty);
      const variantId = String(item.variant_id || item.product_variant_id || item.variant?.id || item.product_variant?.id || "");
      const nestedVariants = item.product_variants || item.product?.product_variants || item.product?.variants || [];
      const nestedVariant = Array.isArray(nestedVariants) ? nestedVariants.find(entry => String(entry.id || entry.variant_id) === variantId) || nestedVariants[0] || {} : nestedVariants;
      const variant = item.product_variant || item.variant || nestedVariant || {};
      return {
        id: String(item.id || item.invoice_item_id), name: item.product_name || item.name || item.product?.name || "منتج",
        sku: item.sku || item.variant?.sku || "—",
        barcode: item.barcode || item.variant?.barcode || item.product_variant?.barcode || item.product?.barcode || item.sku || item.variant?.sku || "—", purchasedQty,
        size: item.size || item.variant_size || item.product_size || item.size_name || variant.size || variant.size_name || "",
        color: item.color || item.variant_color || item.product_color || item.color_name || variant.color || variant.color_name || "",
        returnedQty: Math.max(returnedQty, purchasedQty - returnableQty), soldQty: returnableQty, qty: 0,
        price: Number(item.unit_price || item.price || item.sale_price || 0), selected: false,
        variantId: item.variant_id || item.variant?.id || null, version: Number(item.version || item.variant?.version || 1)
      };
    });
    return [];
  }

  function getSelectedReturnItems() {
    return state.returnItems.filter(item => item.selected && item.qty > 0);
  }

  function getReturnTotals() {
    const grossSubtotal = roundMoney(getSelectedReturnItems().reduce((sum, item) => sum + item.price * item.qty, 0));
    const invoiceSubtotal = Number(state.currentInvoice?.subtotal || 0);
    const discountRate = invoiceSubtotal > 0 ? Math.min(Number(state.currentInvoice?.discount || 0) / invoiceSubtotal, 1) : 0;
    const discount = roundMoney(grossSubtotal * discountRate);
    const subtotal = roundMoney(grossSubtotal - discount);
    const taxableBase = Math.max(invoiceSubtotal - Number(state.currentInvoice?.discount || 0), 0);
    const taxRate = taxableBase > 0 ? Number(state.currentInvoice?.tax || 0) / taxableBase : 0;
    const tax = roundMoney(subtotal * taxRate);
    return { grossSubtotal, discount, subtotal, tax, total: roundMoney(subtotal + tax), taxRate, discountRate };
  }

  function getExchangeTotal() {
    return roundMoney(state.exchangeCart.reduce((sum, item) => sum + item.price * item.qty, 0));
  }

  async function getCurrentShiftId() {
    if (state.currentShift?.id || state.currentShift?.shift_id) {
      return state.currentShift.id || state.currentShift.shift_id;
    }
    const response = await api.get("/api/v1/shifts/current");
    state.currentShift = response?.shift || response?.data || response;
    const shiftId = state.currentShift?.id || state.currentShift?.shift_id;
    if (!shiftId) throw new Error("لا توجد وردية مفتوحة لتنفيذ الاستبدال.");
    return shiftId;
  }

  function setFlowHeading(title) {
    els.returnFlowTitle.textContent = title;
    els.returnFlowInvoiceNo.textContent = state.currentInvoice ? `رقم الفاتورة: #${state.currentInvoice.number || state.currentInvoice.invoice_number || state.currentInvoice.id}` : "";
  }

  function firstReplacementRecord(value) {
    const record = Array.isArray(value) ? value[0] : value;
    if (!record || typeof record !== "object") return {};
    const nested = record.data || record.item;
    return nested && nested !== record ? firstReplacementRecord(nested) : record;
  }

  function visibleReplacementValue(value) {
    const text = String(value || "").trim();
    return text && !["افتراضي", "غير محدد", "—", "default", "n/a", "null"].includes(text.toLowerCase()) ? text : "";
  }

  function normalizeReplacementProduct(item) {
    const productSource = item.product || item.products;
    const product = productSource ? firstReplacementRecord(productSource) : item;
    const categorySource = product.category || item.category || product.categories || item.categories;
    const category = firstReplacementRecord(categorySource);
    const categoryId = category.id ?? category.uuid ?? category.category_id ?? product.category_id ?? item.category_id ?? "";
    const categoryName = category.name || category.name_ar || category.category_name || product.category_name || item.category_name || (typeof categorySource === "string" ? categorySource : "");
    return {
      id: String(item.variant_id || item.product_variant_id || item.variant?.id || item.id),
      productId: String(item.product_id || product.id || item.id),
      name: product.name_ar || product.name || item.name_ar || item.name || "منتج",
      sku: String(item.sku || product.sku || ""), barcode: String(item.barcode || product.barcode || ""),
      price: Number(item.sale_price ?? product.sale_price ?? item.price ?? 0), categoryId: String(categoryId).trim(), category: categoryName || "بدون تصنيف",
      size: item.size || item.variant?.size || product.size || "", color: item.color || item.variant?.color || product.color || "",
      stock: Number(item.stock_qty ?? item.stock_quantity ?? item.quantity ?? product.stock_qty ?? product.stock_quantity ?? 0), version: Number(item.version || 1)
    };
  }

  function normalizeReplacementProducts(response) {
    return listFrom(response).flatMap(item => {
      const variants = item.product_variants || item.variants;
      return Array.isArray(variants) && variants.length ? variants.map(variant => normalizeReplacementProduct({ ...variant, product: item })) : [normalizeReplacementProduct(item)];
    }).filter(item => item.id && item.stock > 0);
  }

  function replacementCategoryId() {
    if (state.exchangeCategory === "الكل") return "";
    return state.replacementCategories.find(category => category.name === state.exchangeCategory)?.id || "";
  }

  async function loadReplacementProducts({ render = true, append = false } = {}) {
    const requestId = ++state.replacementRequestId;
    if (!append) state.replacementPage = 1;
    state.replacementStatus = "loading";
    state.replacementError = "";
    if (render && state.returnStep === "exchange") renderExchangePicker();
    try {
      const response = await api.get("/api/v1/products/search", {
        query: {
          q: state.exchangeQuery.trim() || undefined,
          category_id: replacementCategoryId() || undefined,
          in_stock: true,
          page: state.replacementPage,
          page_size: 100
        }
      });
      if (requestId !== state.replacementRequestId) return;
      const products = normalizeReplacementProducts(response);
      if (append) {
        const merged = new Map(state.replacementProducts.map(product => [product.id, product]));
        products.forEach(product => merged.set(product.id, product));
        state.replacementProducts = [...merged.values()];
      } else state.replacementProducts = products;
      const total = Number(response?.total ?? response?.pagination?.total);
      state.replacementHasMore = Number.isFinite(total) ? state.replacementPage * 100 < total : products.length === 100;
      state.replacementStatus = state.replacementProducts.length ? "success" : "empty";
    } catch (error) {
      if (requestId !== state.replacementRequestId) return;
      if (!append) state.replacementProducts = [];
      state.replacementStatus = append && state.replacementProducts.length ? "success" : "error";
      state.replacementError = error.message;
      if (append) showToast("تعذّر تحميل المزيد من المنتجات.", "error");
    }
    if (render && state.returnStep === "exchange") renderExchangePicker();
  }

  function addExchangeItem(product) {
    if (!product || product.stock <= 0) return;
    const existing = state.exchangeCart.find(item => item.id === product.id);
    if (existing) {
      if (existing.qty >= product.stock) {
        showToast("لا توجد كمية إضافية من هذا المنتج في المخزون.", "error");
        return;
      }
      existing.qty += 1;
      existing.stock = product.stock;
      existing.version = product.version;
    } else {
      state.exchangeCart.push({ ...product, qty: 1 });
    }
  }

  async function findReplacementByCode(rawCode) {
    const code = String(rawCode || "").replace(/[\r\n\t]/g, "").trim();
    if (!code) return false;
    let product = state.replacementProducts.find(item => item.barcode.toLowerCase() === code.toLowerCase() || item.sku.toLowerCase() === code.toLowerCase());
    if (!product) {
      try {
        const response = await api.get(`/api/v1/products/barcode/${encodeURIComponent(code)}`);
        product = normalizeReplacementProduct(response?.item || response?.data || response);
      } catch {
        showToast(`لم يتم العثور على منتج بالكود: ${code}`, "error");
        return false;
      }
    }
    if (!product.id || product.stock <= 0) {
      showToast("هذا المنتج غير متاح في المخزون.", "error");
      return false;
    }
    const catalogItem = state.replacementProducts.find(item => item.id === product.id);
    if (catalogItem) Object.assign(catalogItem, product);
    else state.replacementProducts.push(product);
    addExchangeItem(product);
    state.exchangeQuery = "";
    renderExchangePicker();
    requestAnimationFrame(() => document.getElementById("exchangeSearch")?.focus());
    return true;
  }

  async function refreshExchangeCartStock() {
    const refreshed = [];
    for (const item of state.exchangeCart) {
      let latest;
      try {
        if (item.barcode) latest = normalizeReplacementProduct(await api.get(`/api/v1/products/barcode/${encodeURIComponent(item.barcode)}`, { query: { _: Date.now() } }));
        else {
          const response = await api.get("/api/v1/products/search", { query: { q: item.sku, in_stock: true, page: 1, page_size: 20, _: Date.now() } });
          latest = normalizeReplacementProducts(response).find(product => product.id === item.id || product.sku === item.sku);
        }
      } catch { latest = null; }
      if (!latest?.id || latest.stock <= 0) continue;
      refreshed.push({ ...item, ...latest, qty: Math.min(item.qty, latest.stock) });
    }
    state.exchangeCart = refreshed;
    await loadReplacementProducts({ render: false });
  }

  async function openReturnFlow(inv, mode = "return") {
    state.currentInvoice = inv;
    state.returnStep = "select";
    await loadInvoiceOperations(inv.id);
    state.returnItems = buildReturnItems(inv);
    state.replacementProducts = [];
    state.replacementCategories = [];
    state.exchangeCart = [];
    state.refundMethod = mode === "exchange" ? "exchange" : "store-credit";
    state.returnReason = "";
    state.paymentMethod = "cash";
    state.exchangeCategory = "الكل";
    state.exchangeQuery = "";
    state.exchangeVariantKey = "";
    state.exchangeVariantSize = "";
    state.replacementStatus = "loading";
    state.replacementError = "";
    state.replacementPage = 1;
    state.replacementHasMore = false;
    state.exchangeCartOpen = false;
    state.lastOperation = null;
    state.lastOperationType = "";
    els.returnFlowOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    renderReturnFlow();
    try {
      state.replacementCategories = listFrom(await api.get("/api/v1/categories")).filter(item => item.status !== "inactive" && item.is_active !== false).map(item => {
        const category = firstReplacementRecord(item);
        return { id: String(category.id || category.uuid || category.category_id || ""), name: category.name || category.name_ar || category.category_name };
      }).filter(item => item.id && item.name);
    } catch { state.replacementCategories = []; }
    await loadReplacementProducts({ render: false });
  }

  async function submitReturn() {
    const reason = (document.getElementById("returnReason")?.value || state.returnReason || "").trim();
    if (!reason) throw new Error("اكتب سبب الإرجاع");
    const payload = {
      reason,
      refund_method: state.refundMethod === "store-credit" ? "store_credit" : "cash",
      return_items: getSelectedReturnItems().map(item => ({ invoice_item_id: item.id, quantity: item.qty }))
    };
    const path = `/api/v1/sales-invoices/${encodeURIComponent(state.currentInvoice.id)}/returns`;
    await api.post(`${path}/quote`, payload);
    const response = await api.post(path, payload, { headers: { "Idempotency-Key": idempotencyKey() } });
    state.lastOperation = response?.return || response?.data || response;
    state.lastOperationType = "return";
    state.returnStep = "success"; renderReturnFlow(); await loadData();
  }

  async function submitExchange() {
    const difference = roundMoney(getExchangeTotal() - getReturnTotals().total);
    const payload = {
      reason: state.returnReason.trim() || "استبدال",
      refund_method: difference < 0 ? "cash" : null,
      return_items: getSelectedReturnItems().map(item => ({ invoice_item_id: item.id, quantity: item.qty })),
      replacement_items: state.exchangeCart.map(item => ({ variant_id: item.id, quantity: item.qty, expected_version: item.version })),
      difference_payment: difference > 0 ? { method: state.paymentMethod, amount: difference, cash_amount: state.paymentMethod === "cash" ? difference : 0, card_amount: state.paymentMethod === "card" ? difference : 0 } : null,
      sales_person_id: state.currentInvoice.sales_person_id || state.currentInvoice.sales_user?.id || null,
      shift_id: await getCurrentShiftId()
    };
    const path = `/api/v1/sales-invoices/${encodeURIComponent(state.currentInvoice.id)}/exchanges`;
    const quotePayload = { reason: payload.reason, refund_method: payload.refund_method, return_items: payload.return_items, replacement_items: payload.replacement_items, difference_payment: payload.difference_payment };
    await api.post(`${path}/quote`, quotePayload);
    const response = await api.post(path, payload, { headers: { "Idempotency-Key": idempotencyKey() } });
    state.lastOperation = response?.exchange || response?.operation || response?.result?.exchange || response?.result || response?.data?.exchange || response?.data || response;
    state.lastOperationType = "exchange";
    state.returnStep = "success"; renderReturnFlow(); await loadData();
  }

  function closeReturnFlow() {
    els.returnFlowOverlay.hidden = true;
    document.body.style.overflow = "";
    state.currentInvoice = null;
  }

  function renderReturnFlow() {
    els.returnFlowOverlay.dataset.step = state.returnStep;
    const previousSteps = { manage: "select", exchange: "manage", summary: "exchange" };
    els.returnFlowBackBtn.hidden = !previousSteps[state.returnStep];
    els.returnFlowBackBtn.dataset.previousStep = previousSteps[state.returnStep] || "";
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
            <div class="return-row${item.selected ? " is-selected" : ""}${item.soldQty <= 0 ? " is-returned" : ""}" data-return-id="${item.id}">
              <label class="return-product">
                <input type="checkbox" data-flow-action="toggle-return" ${item.selected ? "checked" : ""} ${item.soldQty <= 0 ? "disabled" : ""} />
                <span>${escapeHtml(item.name)}${item.soldQty <= 0 ? '<em class="return-status-badge">تم الارتجاع</em>' : ""}<small>SKU: ${escapeHtml(item.sku)}${item.returnedQty > 0 && item.soldQty > 0 ? ` · تم ارتجاع ${item.returnedQty} من ${item.purchasedQty}` : ""}</small></span>
              </label>
              <span class="num">${item.purchasedQty}</span>
              <div class="return-stepper">
                <button type="button" data-flow-action="return-dec" ${!item.selected || item.qty <= 1 ? "disabled" : ""}>−</button>
                <span class="num">${item.qty}</span>
                <button type="button" data-flow-action="return-inc" ${!item.selected || item.qty >= item.soldQty || item.soldQty <= 0 ? "disabled" : ""}>+</button>
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
    const { grossSubtotal, discount, tax, total, taxRate } = getReturnTotals();
    els.returnFlowBody.innerHTML = `
      <div class="return-manage">
        <div class="return-manage__products">
          <h3>تحديد المنتجات المرتجعة</h3>
          ${getSelectedReturnItems().map(item => `<div class="return-selected-card is-selected"><span>${escapeHtml(item.name)}<small>SKU: ${escapeHtml(item.sku)}</small></span><span class="num">${item.qty} قطعة</span><strong class="return-price num">${formatMoney(item.price * item.qty)} ج.م</strong></div>`).join("")}
        </div>
        <div class="return-manage__options">
          <label class="return-reason"><span>سبب الإرجاع</span><textarea class="input" id="returnReason" rows="3" maxlength="500" placeholder="اكتب سبب الإرجاع بالتفصيل...">${escapeHtml(state.returnReason)}</textarea></label>
          <h3>طريقة استرداد المبلغ</h3>
          <div class="refund-method">
            ${refundOption("cash", "نقدًا (Cash)", "إرجاع المبلغ فورًا من الصندوق")}
            ${refundOption("store-credit", "رصيد متجر (Store Credit)", "إضافة المبلغ لمحفظة العميل")}
            ${refundOption("exchange", "استبدال (Exchange)", "اختيار منتجات بديلة بنفس القيمة")}
          </div>
          <div class="return-breakdown"><div><span>المنتجات المرتجعة</span><span class="num">${formatMoney(grossSubtotal)} ج.م</span></div>${discount > 0 ? `<div><span>نصيب الخصم</span><span class="num">-${formatMoney(discount)} ج.م</span></div>` : ""}<div><span>الضريبة (${formatMoney(taxRate * 100)}%)</span><span class="num">${formatMoney(tax)} ج.م</span></div><div class="return-breakdown__total"><span>إجمالي المسترد</span><span class="num">${formatMoney(total)} ج.م</span></div></div>
          <div class="return-actions"><button class="btn btn-outline flow-back-button" type="button" data-flow-action="back-select"><span aria-hidden="true">→</span> رجوع</button><button class="btn btn-primary" type="button" data-flow-action="confirm-return">${state.refundMethod === "exchange" ? "متابعة الاستبدال" : "تأكيد المرتجع"}</button></div>
        </div>
      </div>`;
  }

  function refundOption(value, title, hint) {
    return `<label class="refund-option${state.refundMethod === value ? " is-active" : ""}"><input type="radio" name="refundMethod" value="${value}" data-flow-action="refund-method" ${state.refundMethod === value ? "checked" : ""}><span><strong>${title}</strong><small>${hint}</small></span><span>↔</span></label>`;
  }

  function renderExchangePicker() {
    setFlowHeading("اختيار المنتجات البديلة");
    const total = getExchangeTotal();
    const returnCredit = getReturnTotals().total;
    const difference = roundMoney(total - returnCredit);
    const categories = ["الكل", ...new Set([...state.replacementCategories.map(category => category.name), ...state.replacementProducts.map(product => product.category)].filter(Boolean))];
    const visibleVariants = state.replacementProducts.filter(product => {
      const matchesCategory = state.exchangeCategory === "الكل" || product.category === state.exchangeCategory;
      const query = state.exchangeQuery.trim().toLowerCase();
      const matchesQuery = !query || product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query) || product.barcode.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
    const productGroups = [...visibleVariants.reduce((groups, variant) => {
      const key = variant.productId || variant.id;
      if (!groups.has(key)) groups.set(key, { key, name: variant.name, category: variant.category, variants: [] });
      groups.get(key).variants.push(variant);
      return groups;
    }, new Map()).values()];
    const activeGroup = state.exchangeVariantKey ? state.replacementProducts.filter(item => (item.productId || item.id) === state.exchangeVariantKey) : [];
    const variantSize = item => visibleReplacementValue(item.size) || "غير محدد";
    const sizes = [...new Set(activeGroup.map(variantSize))];
    const matchingColors = state.exchangeVariantSize ? activeGroup.filter(item => variantSize(item) === state.exchangeVariantSize) : [];
    const picker = activeGroup.length > 1 ? `<div class="exchange-variant-overlay"><section class="exchange-variant-picker" role="dialog" aria-modal="true" aria-label="اختيار مقاس ولون ${escapeHtml(activeGroup[0].name)}">
      <header><div><span>اختيار المنتج البديل</span><h3>${escapeHtml(activeGroup[0].name)}</h3></div><button type="button" data-flow-action="close-exchange-variant" aria-label="إغلاق">×</button></header>
      <div class="exchange-variant-step"><div class="exchange-variant-heading"><i>1</i><div><b>اختر المقاس</b><small>${sizes.length} مقاسات متاحة</small></div></div><div class="exchange-size-options">${sizes.map(size => { const stock = activeGroup.filter(item => variantSize(item) === size).reduce((sum, item) => sum + item.stock, 0); return `<button type="button" class="exchange-size-choice${state.exchangeVariantSize === size ? " is-active" : ""}" data-flow-action="choose-exchange-size" data-size="${escapeHtml(size)}"><strong>${escapeHtml(size)}</strong><small>${stock} قطعة</small></button>`; }).join("")}</div></div>
      <div class="exchange-variant-step${state.exchangeVariantSize ? "" : " is-waiting"}"><div class="exchange-variant-heading"><i>2</i><div><b>اختر اللون</b><small>${state.exchangeVariantSize ? `الألوان المتاحة لمقاس ${escapeHtml(state.exchangeVariantSize)}` : "اختر المقاس أولاً"}</small></div></div>${state.exchangeVariantSize ? `<div class="exchange-color-options">${matchingColors.map(item => { const color = visibleReplacementValue(item.color) || "غير محدد"; return `<button type="button" class="exchange-color-choice" data-flow-action="choose-exchange-variant" data-product-id="${escapeHtml(item.id)}" ${item.stock <= 0 ? "disabled" : ""}><span><i aria-hidden="true"></i><strong>${escapeHtml(color)}</strong></span><small>${item.stock} قطعة</small><b>${formatMoney(item.price)} ج.م</b><em>إضافة للسلة ←</em></button>`; }).join("")}</div>` : '<p class="exchange-variant-empty">حدد المقاس لعرض الألوان المتاحة.</p>'}</div>
    </section></div>` : "";
    const catalogContent = state.replacementStatus === "loading"
      ? '<div class="view-loading exchange-catalog-state" role="status"><span class="spinner" aria-hidden="true"></span><p>جاري تحميل المنتجات المتاحة...</p></div>'
      : state.replacementStatus === "error"
        ? `<div class="error-state exchange-catalog-state"><h3>تعذّر تحميل المنتجات</h3><p>${escapeHtml(state.replacementError || "تحقق من الاتصال ثم أعد المحاولة.")}</p><button class="btn btn-primary" type="button" data-flow-action="retry-exchange-catalog">إعادة المحاولة</button></div>`
        : productGroups.length
          ? `${productGroups.map(group => { const stock = group.variants.reduce((sum, item) => sum + item.stock, 0), prices = group.variants.map(item => item.price), colors = [...new Set(group.variants.map(item => visibleReplacementValue(item.color)).filter(Boolean))], groupSizes = [...new Set(group.variants.map(item => visibleReplacementValue(item.size)).filter(Boolean))], price = Math.min(...prices) === Math.max(...prices) ? formatMoney(prices[0]) : `${formatMoney(Math.min(...prices))} - ${formatMoney(Math.max(...prices))}`; return `<button class="product-card exchange-product${stock <= 0 ? " is-out-of-stock" : ""}" type="button" data-flow-action="add-exchange" data-product-key="${escapeHtml(group.key)}" ${stock <= 0 ? "disabled" : ""}><div class="product-card__badges"><span class="product-card__badge-stock">المخزون: ${stock}</span>${group.variants.length > 1 ? `<span class="product-card__variant-count">${group.variants.length} اختيارات</span>` : ""}</div><strong class="product-card__name">${escapeHtml(group.name)}</strong>${colors.length || groupSizes.length ? `<div class="product-card__details">${colors.length ? `<span><b>الألوان</b>${escapeHtml(colors.join("، "))}</span>` : ""}${groupSizes.length ? `<span><b>المقاسات</b><span class="product-card__size-list">${groupSizes.map(size => `<strong class="product-card__size">${escapeHtml(size)}</strong>`).join("")}</span></span>` : ""}</div>` : ""}<div class="product-card__footer"><span class="product-card__price num">${price} <small>ج.م</small></span><span class="product-card__choose">${group.variants.length > 1 ? "اختيار" : "إضافة"} +</span></div></button>`; }).join("")}${state.replacementHasMore ? '<div class="exchange-load-more"><button class="btn btn-outline" type="button" data-flow-action="load-more-exchange">تحميل منتجات إضافية</button></div>' : ""}`
          : '<div class="empty-state exchange-catalog-state"><h3>لا توجد منتجات مطابقة</h3><p>جرّب البحث باسم آخر أو اختر تصنيفًا مختلفًا.</p><button class="btn btn-outline" type="button" data-flow-action="reset-exchange-filter">عرض كل المنتجات</button></div>';
    els.returnFlowBody.innerHTML = `
      <div class="exchange-picker">
        <section class="exchange-catalog"><div class="exchange-catalog__tools"><label class="exchange-search"><span>⌕</span><input class="input" id="exchangeSearch" value="${escapeHtml(state.exchangeQuery)}" placeholder="ابحث بالاسم أو SKU أو امسح الباركود..." autocomplete="off"><small>سكانر</small></label><div class="exchange-categories">${categories.map(category => `<button class="exchange-category${state.exchangeCategory === category ? " is-active" : ""}" data-flow-action="exchange-category" data-category="${escapeHtml(category)}" type="button">${escapeHtml(category)}</button>`).join("")}</div></div><main class="exchange-products">${catalogContent}</main></section>
        <button class="exchange-cart-fab" type="button" data-flow-action="toggle-exchange-cart">السلة (${state.exchangeCart.reduce((sum, item) => sum + item.qty, 0)})</button><button class="exchange-cart-shade${state.exchangeCartOpen ? " is-open" : ""}" type="button" data-flow-action="close-exchange-cart" aria-label="إغلاق سلة الاستبدال"></button>
        <aside class="exchange-cart${state.exchangeCartOpen ? " is-open" : ""}"><div class="exchange-cart__header"><h3>سلة الاستبدال</h3><span>${state.exchangeCart.reduce((sum, item) => sum + item.qty, 0)} عناصر</span><button class="exchange-cart__close" type="button" data-flow-action="close-exchange-cart" aria-label="إغلاق السلة">×</button></div><div class="exchange-cart__list">${state.exchangeCart.length ? state.exchangeCart.map(item => `<div class="exchange-cart__item" data-exchange-id="${escapeHtml(item.id)}"><div class="exchange-cart__item-heading"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(visibleReplacementValue(item.size) || "—")} · ${escapeHtml(visibleReplacementValue(item.color) || "—")}</small></span><button class="exchange-cart__remove" type="button" data-flow-action="exchange-remove" aria-label="حذف ${escapeHtml(item.name)}">×</button></div><div><span class="return-stepper"><button type="button" data-flow-action="exchange-dec">−</button><span class="num">${item.qty}</span><button type="button" data-flow-action="exchange-inc" ${item.qty >= item.stock ? "disabled" : ""}>+</button></span><span class="return-price num">${formatMoney(item.price * item.qty)} ج.م</span></div><small class="exchange-cart__stock">المتاح: ${item.stock} قطعة</small></div>`).join("") : '<div class="empty-state exchange-cart__empty"><h3>السلة فارغة</h3><p>اختر منتجًا بديلًا أو امسح باركوده.</p></div>'}</div><div class="return-breakdown exchange-live-totals"><div><span>رصيد المنتجات المرتجعة</span><strong class="num">${formatMoney(returnCredit)} ج.م</strong></div><div><span>إجمالي المنتجات البديلة</span><strong class="num">${formatMoney(total)} ج.م</strong></div><div class="return-breakdown__total"><span>${difference > 0 ? "المطلوب من العميل" : difference < 0 ? "المستحق للعميل" : "لا يوجد فرق"}</span><strong class="num">${formatMoney(Math.abs(difference))} ج.م</strong></div></div><div class="exchange-cart__actions"><button class="exchange-back-button" type="button" data-flow-action="back-manage"><span aria-hidden="true">→</span><b>الرجوع</b><small>لطريقة الاسترداد</small></button><button class="btn btn-primary exchange-next" type="button" data-flow-action="to-summary" ${state.exchangeCart.length === 0 ? "disabled" : ""}>التالي</button></div></aside>${picker}
      </div>`;
  }

  function renderExchangeSummary() {
    setFlowHeading("ملخص عملية الاستبدال");
    const returnTotal = getReturnTotals().total;
    const exchangeTotal = getExchangeTotal();
    const difference = roundMoney(exchangeTotal - returnTotal);
    els.returnFlowBody.innerHTML = `
      <div class="exchange-summary">
        <div class="exchange-summary__columns">
          <section class="exchange-card"><h3>المنتجات المرتجعة</h3>${getSelectedReturnItems().map(item => `<div class="exchange-summary-row"><span>${escapeHtml(item.name)} × ${item.qty}</span><span class="num">${formatMoney(item.price * item.qty)} ج.م</span></div>`).join("")}<div class="return-breakdown__total">إجمالي المرتجعات: <span class="num">${formatMoney(returnTotal)} ج.م</span></div></section>
          <section class="exchange-card"><h3>المنتجات البديلة</h3>${state.exchangeCart.map(item => `<div class="exchange-summary-row"><span>${escapeHtml(item.name)} × ${item.qty}</span><span class="num">${formatMoney(item.price * item.qty)} ج.م</span></div>`).join("")}<div class="return-breakdown__total">إجمالي البدائل: <span class="num">${formatMoney(exchangeTotal)} ج.م</span></div></section>
        </div>
        <section class="difference-card"><div><span>${difference >= 0 ? "الفرق المستحق للدفع" : "الفرق المستحق للعميل"}</span><strong class="difference-value num">${formatMoney(Math.abs(difference))} ج.م</strong></div>${difference > 0 ? `<p>اختر طريقة تحصيل الفارق:</p><div class="payment-options">${paymentOption("cash", "نقدي")}${paymentOption("card", "بطاقة")}</div>` : ""}</section>
        <div class="return-footer"><span>حالة العملية: بانتظار التأكيد</span><div class="return-actions"><button class="btn btn-outline flow-back-button" data-flow-action="back-exchange"><span aria-hidden="true">→</span> رجوع</button><button class="btn btn-primary" data-flow-action="finish-exchange">تأكيد الاستبدال وإنهاء</button></div></div>
      </div>`;
  }

  function paymentOption(value, label) {
    return `<button class="payment-option${state.paymentMethod === value ? " is-active" : ""}" type="button" data-flow-action="payment-method" data-value="${value}">${label}</button>`;
  }

  function renderFlowSuccess() {
    const isExchange = state.lastOperationType === "exchange" || state.refundMethod === "exchange";
    const returnTotal = getReturnTotals().total;
    const exchangeTotal = getExchangeTotal();
    const operation = state.lastOperation || {};
    const operationNumber = operation.return_number || operation.exchange_number || operation.number || operation.id || "—";
    const operationAmount = isExchange ? Math.abs(roundMoney(operation.difference_amount ?? operation.net_difference ?? exchangeTotal - returnTotal)) : roundMoney(operation.total_refund ?? operation.return_total ?? returnTotal);
    setFlowHeading(isExchange ? "نجاح عملية الاستبدال" : "نجاح عملية المرتجع");
    els.returnFlowBody.innerHTML = `<div class="flow-success"><div class="flow-success__icon">✓</div><h3>${isExchange ? "تم تنفيذ الاستبدال بنجاح" : "تم تنفيذ المرتجع بنجاح"}</h3><p>تمت معالجة الطلب وتحديث المخزون</p><div class="flow-success__details"><div><span>${isExchange ? "رقم حركة الاستبدال" : "رقم إيصال المرتجع"}</span><strong class="num">#${escapeHtml(operationNumber)}</strong></div><div><span>${isExchange ? "صافي الفارق" : "المبلغ المسترد"}</span><strong class="num">${formatMoney(operationAmount)} ج.م</strong></div></div><div class="flow-success__actions"><button class="btn btn-primary" data-flow-action="print-return">${isExchange ? "طباعة إيصال الاستبدال" : "طباعة إيصال المرتجع"}</button><button class="btn btn-outline" data-flow-action="close-success">إغلاق النافذة</button></div></div>`;
  }

  function printReturnReceipt() {
    const isExchange = state.lastOperationType === "exchange" || state.refundMethod === "exchange";
    const returnTotal = getReturnTotals().total;
    const exchangeTotal = getExchangeTotal();
    const operation = state.lastOperation || {};
    const operationNumber = operation.return_number || operation.exchange_number || operation.operation_number || operation.number || operation.id || "—";
    const originalInvoiceNumber = state.currentInvoice.number || state.currentInvoice.invoice_number || "—";
    const barcode = String(operationNumber).replace(/\D/g, "");
    if (window.GhaithPrint) {
      window.GhaithPrint.printReceipt({title:isExchange?"إيصال استبدال":"إيصال مرتجع",number:operationNumber,barcode,customer:state.currentInvoice.customer,customer_phone:state.currentInvoice.phone || "",cashier:state.currentInvoice.cashier || "—",sales:state.currentInvoice.sales || "—",note:`الفاتورة الأصلية: ${originalInvoiceNumber}`,items:[...getSelectedReturnItems().map(item=>({name:item.name,sku:item.sku,qty:item.qty,price:item.price,size:item.size || "",color:item.color || "",status:"تم الارتجاع"})),...(isExchange?state.exchangeCart.map(item=>({name:item.name,sku:item.sku,qty:item.qty,price:item.price,size:item.size || "",color:item.color || "",status:"منتج بديل"})):[])],totals:[{label:"قيمة المرتجعات",value:returnTotal},...(isExchange?[{label:"قيمة البدائل",value:exchangeTotal},{label:"صافي الفارق",value:Math.abs(exchangeTotal-returnTotal),final:true}]:[{label:"المبلغ المسترد",value:returnTotal,final:true}])]});
      return;
    }
    els.printArea.innerHTML = `<div class="receipt"><div class="r-header"><h2>غيث للزي الاسلامي الراقي</h2><p class="r-sub">إيصال ${isExchange ? "استبدال" : "مرتجع"} #${escapeHtml(operationNumber)}</p><p>الفاتورة الأصلية: ${escapeHtml(originalInvoiceNumber)}</p></div><div class="r-totals"><div class="r-row"><span>قيمة المرتجعات:</span><span>${formatMoney(returnTotal)} ج.م</span></div>${isExchange ? `<div class="r-row"><span>قيمة البدائل:</span><span>${formatMoney(exchangeTotal)} ج.م</span></div><div class="r-row r-final"><span>صافي الفارق:</span><span>${formatMoney(Math.abs(roundMoney(exchangeTotal - returnTotal)))} ج.م</span></div>` : `<div class="r-row r-final"><span>المبلغ المسترد:</span><span>${formatMoney(returnTotal)} ج.م</span></div>`}</div></div>`;
    window.print();
  }

  els.returnFlowBody.addEventListener("click", async event => {
    if (event.target.classList.contains("exchange-variant-overlay")) { state.exchangeVariantKey = ""; state.exchangeVariantSize = ""; renderExchangePicker(); return; }
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
    if (action === "back-manage") { state.returnStep = "manage"; renderReturnFlow(); }
    if (action === "confirm-return") { if (state.refundMethod === "exchange") { state.returnStep = "exchange"; renderReturnFlow(); } else { try { target.disabled = true; await submitReturn(); } catch (error) { showToast(error.message, "error"); target.disabled = false; } } }
    if (action === "add-exchange") { const variants = state.replacementProducts.filter(item => (item.productId || item.id) === target.dataset.productKey); if (variants.length === 1) addExchangeItem(variants[0]); else { const sizes = [...new Set(variants.map(item => visibleReplacementValue(item.size) || "غير محدد"))]; state.exchangeVariantKey = target.dataset.productKey; state.exchangeVariantSize = sizes.length === 1 ? sizes[0] : ""; } renderExchangePicker(); }
    if (action === "choose-exchange-size") { state.exchangeVariantSize = target.dataset.size; renderExchangePicker(); }
    if (action === "choose-exchange-variant") { addExchangeItem(state.replacementProducts.find(item => item.id === target.dataset.productId)); state.exchangeVariantKey = ""; state.exchangeVariantSize = ""; renderExchangePicker(); }
    if (action === "close-exchange-variant") { state.exchangeVariantKey = ""; state.exchangeVariantSize = ""; renderExchangePicker(); }
    if (action === "exchange-category") { state.exchangeCategory = target.dataset.category; await loadReplacementProducts(); }
    if (action === "retry-exchange-catalog") await loadReplacementProducts();
    if (action === "load-more-exchange") { state.replacementPage += 1; await loadReplacementProducts({ append: true }); }
    if (action === "reset-exchange-filter") { state.exchangeCategory = "الكل"; state.exchangeQuery = ""; await loadReplacementProducts(); }
    if (action === "toggle-exchange-cart") { state.exchangeCartOpen = !state.exchangeCartOpen; renderExchangePicker(); }
    if (action === "close-exchange-cart") { state.exchangeCartOpen = false; renderExchangePicker(); }
    if (action === "exchange-inc" && exchangeItem) { if (exchangeItem.qty >= exchangeItem.stock) showToast("وصلت للكمية المتاحة في المخزون.", "error"); else exchangeItem.qty++; renderExchangePicker(); }
    if (action === "exchange-dec" && exchangeItem) { exchangeItem.qty--; if (exchangeItem.qty <= 0) state.exchangeCart = state.exchangeCart.filter(item => item.id !== exchangeItem.id); renderExchangePicker(); }
    if (action === "exchange-remove" && exchangeItem) { state.exchangeCart = state.exchangeCart.filter(item => item.id !== exchangeItem.id); renderExchangePicker(); }
    if (action === "to-summary") { state.returnStep = "summary"; renderReturnFlow(); }
    if (action === "back-exchange") { state.returnStep = "exchange"; renderReturnFlow(); }
    if (action === "payment-method") { state.paymentMethod = target.dataset.value; renderExchangeSummary(); }
    if (action === "finish-exchange") { try { target.disabled = true; await submitExchange(); } catch (error) { if (error.status === 409) { await refreshExchangeCartStock(); state.returnStep = "exchange"; renderReturnFlow(); showToast(state.exchangeCart.length ? "تم تحديث المخزون والكميات. راجع السلة ثم حاول مرة أخرى." : "تغيّر المخزون ولم تعد المنتجات المختارة متاحة.", "error"); } else { showToast(error.message, "error"); target.disabled = false; } } }
    if (action === "print-return") printReturnReceipt();
  });

  els.returnFlowBody.addEventListener("change", event => {
    if (event.target.dataset.flowAction === "refund-method") { state.refundMethod = event.target.value; renderReturnManagement(); }
  });

  const updateExchangeSearch = debounce(async value => { state.exchangeQuery = value; await loadReplacementProducts(); }, 350);
  els.returnFlowBody.addEventListener("input", event => {
    if (event.target.id === "returnReason") state.returnReason = event.target.value;
    if (event.target.id === "exchangeSearch") updateExchangeSearch(event.target.value);
  });

  els.returnFlowBody.addEventListener("keydown", event => {
    if (event.target.id !== "exchangeSearch" || !["Enter", "Tab"].includes(event.key)) return;
    const value = event.target.value.trim();
    if (!value) return;
    event.preventDefault();
    findReplacementByCode(value);
  });

  const EXCHANGE_SCAN_GAP_MS = 120;
  let exchangeScanBuffer = "";
  let exchangeScanLastKeyAt = 0;
  let exchangeScanResetTimer = null;
  document.addEventListener("keydown", event => {
    if (els.returnFlowOverlay.hidden || state.returnStep !== "exchange" || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable)) return;
    const now = performance.now();
    if (["Enter", "Tab"].includes(event.key)) {
      if (exchangeScanBuffer.length >= 4 && now - exchangeScanLastKeyAt <= EXCHANGE_SCAN_GAP_MS) {
        event.preventDefault();
        findReplacementByCode(exchangeScanBuffer);
      }
      exchangeScanBuffer = "";
      clearTimeout(exchangeScanResetTimer);
      return;
    }
    if (event.key.length !== 1 || event.repeat) return;
    if (now - exchangeScanLastKeyAt > EXCHANGE_SCAN_GAP_MS) exchangeScanBuffer = "";
    exchangeScanBuffer += event.key;
    exchangeScanLastKeyAt = now;
    clearTimeout(exchangeScanResetTimer);
    exchangeScanResetTimer = setTimeout(() => { exchangeScanBuffer = ""; }, EXCHANGE_SCAN_GAP_MS * 2);
  });

  els.closeReturnFlowBtn.addEventListener("click", closeReturnFlow);
  els.returnFlowBackBtn.addEventListener("click", () => {
    const previousStep = els.returnFlowBackBtn.dataset.previousStep;
    if (previousStep) { state.returnStep = previousStep; renderReturnFlow(); }
  });
  els.returnFlowOverlay.addEventListener("click", event => { if (event.target === els.returnFlowOverlay) closeReturnFlow(); });

  /* ------------------------------------------------------------------ */
  /* 13) مودال التفاصيل                                                  */
  /* ------------------------------------------------------------------ */
  async function openDetailModal(inv) {
    state.currentInvoice = inv;
    await loadInvoiceOperations(inv.id, { notify: true });
    const { date, time } = formatDate(inv.date);
    const st = STATUS_MAP[inv.status] || { cls: "is-done", label: inv.status };
    const items = buildReturnItems(inv);
    const subtotal = Number(inv.subtotal || (inv.total + inv.discount - inv.tax));
    const tax = Number(inv.tax || 0);
    const customer = inv.customerData || {};
    const operationsMarkup = state.operations.length ? state.operations.map(operation => {
      const type = operationType(operation);
      const label = type === "exchange" ? "استبدال" : "مرتجع";
      const invoiceReference = operationInvoiceReference(operation);
      const operationDetails = [operation.reason && `السبب: ${operation.reason}`, operation.refund_method && `الاسترداد: ${REFUND_LABELS[operation.refund_method] || operation.refund_method}`].filter(Boolean).join(" · ");
      const replacementNames = operationItems(operation, "replacement").map(item => `${operationItemName(item)} × ${operationItemQuantity(item)}`).join("، ");
      return `<article class="related-operation${type === "exchange" ? " is-exchange" : ""}"><span>${label} · ${invoiceReference.label}</span><strong class="num">#${escapeHtml(invoiceReference.value)}</strong>${replacementNames ? `<b class="related-operation__products">البديل: ${escapeHtml(replacementNames)}</b>` : ""}<small>${escapeHtml(operationDetails || STATUS_LABELS[operation.status] || operation.status || "مكتملة")} · ${formatMoney(operation.total_refund ?? operation.total_amount ?? operation.return_total ?? operation.difference_amount ?? 0)} ج.م</small></article>`;
    }).join("") : '<article class="related-operation"><span>لا توجد عمليات مرتبطة</span><strong>—</strong><small>حتى الآن</small></article>';
    els.detailTitle.innerHTML = `<span>تفاصيل الفاتورة <b class="num">#${escapeHtml(inv.number)}</b></span><span class="inv-detail-status">${escapeHtml(st.label)}</span>`;

    els.detailBody.innerHTML = `
      <div class="invoice-detail-layout">
        <aside class="invoice-detail-side">
          <section class="detail-summary-card">
            <h3>ملخص الحساب</h3>
            <div><span>المجموع الفرعي:</span><span class="num">${formatMoney(subtotal)} ج.م</span></div>
            <div class="detail-discount-row"><span>الخصم:<small>${escapeHtml(inv.discountLabel)}</small></span><span class="num detail-danger">${formatMoney(inv.discount)}- ج.م</span></div>
            <div><span>الضريبة:</span><span class="num">${formatMoney(tax)} ج.م</span></div>
            <div class="detail-summary-total"><span>الإجمالي:</span><strong class="num">${formatMoney(inv.total)}</strong></div>
            <div><span>المدفوع:</span><span class="num">${formatMoney(inv.paid)} ج.م</span></div>
            <div><span>المتبقي:</span><span class="num">${formatMoney(inv.remaining)} ج.م</span></div>
            <div><span>الباقي للعميل:</span><span class="num">${formatMoney(inv.change)} ج.م</span></div>
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
            <section class="detail-info-card"><h3>بيانات العميل</h3><div><span>الاسم:</span><strong>${escapeHtml(inv.customer)}</strong></div><div><span>الجوال:</span><strong class="num">${escapeHtml(inv.phone || "—")}</strong></div><div><span>العنوان:</span><strong>${escapeHtml(customer.address || inv.customer_address || "—")}</strong></div><div><span>الفئة:</span><em>${escapeHtml(customer.customer_type?.name || customer.type_name || inv.customer_type_name || "عميل نقدي")}</em></div></section>
            <section class="detail-info-card"><h3>بيانات الفاتورة</h3><div><span>التاريخ:</span><strong>${escapeHtml(date)}</strong></div><div><span>الوقت:</span><strong>${escapeHtml(time)}</strong></div><div><span>الكاشير:</span><strong>${escapeHtml(inv.cashier)}</strong></div><div><span>السيلز:</span><strong>${escapeHtml(inv.sales || "—")}</strong></div><div><span>طريقة الدفع:</span><strong>${escapeHtml(inv.payment_method)}</strong></div></section>
          </div>
          <div class="detail-products-table"><div class="detail-product-row is-head"><span>المنتج</span><span>التصنيف</span><span>المواصفات</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span></div>${buildReturnItems(inv).map(item => { const source = (inv.items || []).find(line => String(line.id || line.invoice_item_id) === item.id) || {}; return `<div class="detail-product-row${item.soldQty <= 0 ? " is-returned" : ""}"><span>${escapeHtml(item.name)}${item.soldQty <= 0 ? '<em class="return-status-badge">تم الارتجاع</em>' : item.returnedQty > 0 ? `<em class="return-status-badge is-partial">مرتجع ${item.returnedQty}</em>` : ""}</span><span>${escapeHtml(source.category?.name || source.category_name || "—")}</span><span>${escapeHtml(invoiceItemSpecifications(source))}</span><span class="num">${item.purchasedQty}</span><span class="num">${formatMoney(item.price)}</span><span class="num">${formatMoney(item.price * item.purchasedQty)}</span></div>`; }).join("") || '<div class="detail-product-row"><span>لا توجد أصناف</span></div>'}</div>
          <section class="related-operations"><h3>العمليات المرتبطة</h3><div class="related-operations__list"><article class="related-operation is-original"><span>الفاتورة الأصلية</span><strong class="num">#${escapeHtml(inv.number)}</strong><small>${escapeHtml(date)} | ${escapeHtml(inv.cashier)}</small></article>${operationsMarkup}</div></section>
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
      openReturnFlow(inv, button.dataset.detailAction);
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
        number: inv.number,
        date,
        time,
        customer: inv.customer,
        customer_phone: inv.phone || "",
        customer_address: inv.customerData?.address || inv.customer_address || "",
        cashier: inv.cashier,
        sales: inv.sales || "—",
        payment: inv.payment_method,
        paid_amount: inv.paid,
        remaining_amount: inv.remaining,
        barcode: String(inv.number || "").replace(/\D/g, "") || inv.number,
        items: [
          ...buildReturnItems(inv).map(item => ({ name: item.name, status: item.soldQty <= 0 ? "تم الارتجاع" : item.returnedQty > 0 ? `مرتجع ${item.returnedQty}` : "", sku: item.sku, barcode: item.barcode || item.sku, size: item.size, color: item.color, qty: item.purchasedQty || 1, price: item.price || 0, total: (item.price || 0) * (item.purchasedQty || 1) })),
          ...replacementItemsFromOperations().map(item => ({ ...item, status: "منتج بديل" }))
        ],
        totals: [
          ...(Number(inv.subtotal) ? [{ label: "الإجمالي الفرعي", value: inv.subtotal }] : []),
          ...(Number(inv.discount) ? [{ label: inv.discountLabel || "الخصم", value: inv.discount, negative: true }] : []),
          { label: "الإجمالي النهائي", value: inv.total, final: true },
          { label: "المدفوع", value: inv.paid },
          { label: "المتبقي", value: inv.remaining, emphasis: Number(inv.remaining) > 0 }
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
          <p class="r-date">${escapeHtml(date)} — ${escapeHtml(time)} | رقم: ${escapeHtml(inv.number)}</p>
        </div>
        <div class="r-totals">
          <div class="r-row"><span>العميل:</span><span>${escapeHtml(inv.customer)}</span></div>
          <div class="r-row"><span>الهاتف:</span><span>${escapeHtml(inv.phone || "—")}</span></div>
          <div class="r-row"><span>الكاشير:</span><span>${escapeHtml(inv.cashier)}</span></div>
          <div class="r-row"><span>السيلز:</span><span>${escapeHtml(inv.sales || "—")}</span></div>
          <div class="r-row"><span>طريقة الدفع:</span><span>${escapeHtml(inv.payment_method)}</span></div>
          <div class="r-row"><span>الحالة:</span><span>${escapeHtml(st.label)}</span></div>
          <div class="r-row r-final"><span>الإجمالي:</span><span>${formatMoney(inv.total)} ج.م</span></div>
          <div class="r-row"><span>المدفوع:</span><span>${formatMoney(inv.paid)} ج.م</span></div>
          <div class="r-row"><span>المتبقي:</span><span>${formatMoney(inv.remaining)} ج.م</span></div>
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
