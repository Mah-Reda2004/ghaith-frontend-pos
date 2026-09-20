import { bindThemeToggle, initTheme } from "../../../core/theme.js";
import { debounce, escapeHtml, formatMoney } from "../../../core/utils.js";
import { api, idempotencyKey, listFrom } from "../../../core/api.js";

if (document.documentElement.dataset.cashierSpa !== "true") {
  initTheme();
  bindThemeToggle(document.getElementById("themeToggleBtn"));
}

const state = {
  debts: [],
  query: "",
  dateFilter: "all",
  cashierFilter: "all",
  currentDebt: null,
  paymentMethod: "cash",
  usersById: new Map(),
  variantsById: new Map(),
};

const els = {
  debtsList: document.getElementById("debtsList"),
  debtsEmpty: document.getElementById("debtsEmpty"),
  search: document.getElementById("debtSearchInput"),
  refresh: document.getElementById("refreshDebtsBtn"),
  dateFilter: document.getElementById("dateFilterSelect"),
  cashierFilter: document.getElementById("cashierFilterSelect"),
  resultCount: document.getElementById("debtsResultCount"),
  detailOverlay: document.getElementById("debtDetailOverlay"),
  detailBody: document.getElementById("debtDetailBody"),
  closeDetail: document.getElementById("closeDebtDetailBtn"),
  cancelDetail: document.getElementById("cancelDebtDetailBtn"),
  detailPay: document.getElementById("detailPayBtn"),
  detailPrint: document.getElementById("detailPrintBtn"),
  paymentOverlay: document.getElementById("debtPaymentOverlay"),
  paymentBody: document.getElementById("debtPaymentBody"),
  closePayment: document.getElementById("closeDebtPaymentBtn"),
  cancelPayment: document.getElementById("cancelDebtPaymentBtn"),
  confirmPayment: document.getElementById("confirmDebtPaymentBtn"),
  toastStack: document.getElementById("toastStack"),
  printArea: document.getElementById("printArea"),
  startNewSale: document.getElementById("startNewSaleBtn"),
};

function normalizeDebtItem(item) {
  const variantId = String(item.product_variant_id || item.variant_id || item.variant?.id || "");
  const variant = state.variantsById.get(variantId) || item.product_variant || item.variant || {};
  const quantity = Number(item.qty ?? item.quantity ?? 1);
  const price = Number(item.unit_price ?? item.price ?? 0);
  return {
    ...item,
    name: item.product_name || item.name || variant.name || variant.product_name || "منتج",
    sku: item.sku || variant.sku || "—",
    qty: quantity,
    price,
    total: Number(item.total ?? item.line_total ?? price * quantity)
  };
}

function normalizeDebt(item) {
  const customer = item.customers || item.customer || {}, invoice = typeof item.invoice === "object" && item.invoice ? item.invoice : {}, cashier = invoice.cashier || item.cashier || {};
  const created = item.created_at || invoice.created_at || new Date().toISOString();
  const cashierId = item.cashier_id || invoice.cashier_id || cashier.id;
  const rawItems = item.items || item.invoice_items || invoice.items || invoice.invoice_items || [];
  return {
    ...item,
    id: String(item.id),
    customerId: customer.id || item.customer_id || invoice.customer_id,
    invoiceId: item.invoice_id || item.sales_invoice_id || invoice.id || "",
    invoiceNumber: item.invoice_number || item.sales_invoice_number || item.sale_invoice_number || invoice.invoice_number || invoice.number || item.invoiceNumber || "—",
    customer: customer.name || item.customer_name || "عميل نقدي",
    customerPhone: customer.phone || item.customer_phone || "",
    date: created.slice(0, 10),
    time: new Date(created).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
    cashier: state.usersById.get(String(cashierId || "")) || cashier.name || cashier.username || item.cashier_name || "—",
    total: Number(item.total_amount ?? invoice.total_amount ?? item.original_amount ?? 0),
    paid: Number(item.paid_amount ?? item.amount_paid ?? 0),
    remaining: Number(item.remaining_amount ?? item.balance ?? 0),
    subtotal: Number(invoice.subtotal ?? item.subtotal ?? item.total_amount ?? invoice.total_amount ?? invoice.total ?? 0),
    discount: Number(invoice.discount_amount ?? invoice.discount ?? item.discount_amount ?? item.discount ?? 0),
    tax: Number(invoice.tax_amount ?? invoice.vat_amount ?? item.tax_amount ?? item.vat_amount ?? 0),
    items: rawItems.map(normalizeDebtItem)
  };
}

async function loadPagedDirectory(path) {
  const first = await api.get(path, { query: { page: 1, page_size: 100 } });
  const pages = [first];
  const total = Number(first?.total ?? first?.data?.total ?? listFrom(first).length);
  for (let page = 2; page <= Math.ceil(total / 100); page += 1) pages.push(await api.get(path, { query: { page, page_size: 100 } }));
  return pages.flatMap(listFrom);
}

async function loadReferenceData() {
  const [users, products] = await Promise.all([
    loadPagedDirectory("/api/v1/admin/users").catch(() => []),
    loadPagedDirectory("/api/v1/pos/catalog").catch(() => [])
  ]);
  state.usersById = new Map(users.map(entry => {
    const user = entry.user || entry;
    return [String(user.id || entry.user_id || ""), user.name || user.full_name || user.username || "—"];
  }).filter(([id]) => id));
  state.variantsById = new Map(products.flatMap(product => {
    const variants = product.variants || product.product_variants || [product];
    return variants.map(variant => [String(variant.id || variant.variant_id || ""), { ...variant, name: product.name_ar || product.name || variant.name_ar || variant.name }]);
  }).filter(([id]) => id));
}

async function hydrateDebtInvoice(item) {
  if (!item.invoice_id && !item.sales_invoice_id) return item;
  try {
    const response = await api.get(`/api/v1/sales-invoices/${encodeURIComponent(item.invoice_id || item.sales_invoice_id)}`);
    const invoice = response?.invoice || response?.data || response;
    return { ...item, invoice };
  } catch {
    return item;
  }
}

async function loadDebts() {
  els.refresh.disabled = true;
  els.refresh.classList.add("is-loading");
  els.resultCount.textContent = "جاري تحميل المديونيات...";
  try {
    const [response] = await Promise.all([
      api.get("/api/v1/debts", { query: { page: 1, page_size: 100 } }),
      loadReferenceData()
    ]);
    const hydrated = await Promise.all(listFrom(response).map(hydrateDebtInvoice));
    state.debts = hydrated.map(normalizeDebt);
    populateCashierFilter();
    renderDebts();
  } catch (error) {
    state.debts = [];
    renderDebts();
    els.resultCount.textContent = "تعذّر تحميل المديونيات. اضغط تحديث للمحاولة مرة أخرى.";
    showToast("تعذّر تحميل المديونيات. حاول مرة أخرى.", "error");
  } finally {
    els.refresh.disabled = false;
    els.refresh.classList.remove("is-loading");
  }
}

function getVisibleDebts() {
  const query = state.query.trim().toLowerCase();
  return state.debts.filter(debt => {
    const matchesSearch = !query || debt.customer.toLowerCase().includes(query) || debt.invoiceNumber.toLowerCase().includes(query);
    const matchesCashier = state.cashierFilter === "all" || debt.cashier === state.cashierFilter;
    return debt.remaining > 0 && matchesSearch && matchesCashier && matchesDateFilter(debt.date);
  });
}

function matchesDateFilter(value) {
  if (state.dateFilter === "all") return true;
  const debtDate = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (state.dateFilter === "today") return debtDate.getTime() === today.getTime();
  if (state.dateFilter === "week") {
    const difference = (today - debtDate) / 86400000;
    return difference >= 0 && difference < 7;
  }
  return state.dateFilter === "month"
    ? debtDate.getFullYear() === today.getFullYear() && debtDate.getMonth() === today.getMonth()
    : true;
}

function populateCashierFilter() {
  const currentValue = els.cashierFilter.value;
  const cashiers = [...new Set(state.debts.map(debt => debt.cashier).filter(name => name && name !== "—"))];
  els.cashierFilter.innerHTML = `<option value="all">كل الكاشيرية</option>${cashiers.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
  els.cashierFilter.value = cashiers.includes(currentValue) ? currentValue : "all";
  state.cashierFilter = els.cashierFilter.value;
}

function renderDebts() {
  const debts = getVisibleDebts();
  els.resultCount.textContent = debts.length ? `عرض ${debts.length} من أصل ${state.debts.filter(debt => debt.remaining > 0).length} مديونية` : "لا توجد نتائج مطابقة للفلاتر الحالية";
  els.debtsList.hidden = debts.length === 0;
  els.debtsEmpty.hidden = debts.length !== 0;
  if (!debts.length) {
    els.debtsList.innerHTML = "";
    return;
  }

  const fragment = document.createDocumentFragment();
  debts.forEach(debt => {
    const card = document.createElement("article");
    card.className = "debt-card";
    card.dataset.debtId = debt.id;
    card.innerHTML = `
      <div class="debt-card__head"><h2>${escapeHtml(debt.customer)}</h2><p>رقم الفاتورة: <span class="num">#${escapeHtml(debt.invoiceNumber)}</span></p></div>
      <div class="debt-card__row"><span>إجمالي الفاتورة:</span><strong class="num">${formatMoney(debt.total)} ج.م</strong></div>
      <div class="debt-card__row"><span>المبلغ المدفوع:</span><strong class="num">${formatMoney(debt.paid)} ج.م</strong></div>
      <div class="debt-card__row is-remaining"><span>المبلغ المتبقي:</span><strong class="num">${formatMoney(debt.remaining)} ج.م</strong></div>
      <div class="debt-card__actions">
        <button class="debt-card__pay" type="button" data-action="pay">تسديد دفعة</button>
        <button class="debt-card__view" type="button" data-action="view">عرض الفاتورة</button>
        <button class="debt-card__remind" type="button" data-action="remind">إرسال تذكير</button>
      </div>`;
    fragment.appendChild(card);
  });
  els.debtsList.replaceChildren(fragment);
}

function findDebtFromTarget(target) {
  const card = target.closest("[data-debt-id]");
  return card ? state.debts.find(debt => debt.id === card.dataset.debtId) : null;
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast${type === "error" ? " is-error" : ""}`;
  toast.textContent = message;
  els.toastStack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3000);
}

async function openDetail(debt) {
  try {
    const [debtResponse, invoiceResponse] = await Promise.all([
      api.get(`/api/v1/debts/${encodeURIComponent(debt.id)}`),
      debt.invoiceId ? api.get(`/api/v1/sales-invoices/${encodeURIComponent(debt.invoiceId)}`).catch(() => null) : null
    ]);
    const invoice = invoiceResponse?.invoice || invoiceResponse?.data || invoiceResponse || debt.invoice;
    debt = normalizeDebt({ ...debt, ...(debtResponse?.debt || debtResponse?.data || debtResponse), invoice });
    if (debt.customerId) {
      try { debt.customerSummary = await api.get(`/api/v1/debtors/${encodeURIComponent(debt.customerId)}/summary`); }
      catch { debt.customerSummary = null; }
    }
  } catch (error) { showToast(error.message, "error"); return; }
  state.currentDebt = debt;
  const subtotal = debt.subtotal || debt.total + debt.discount - debt.tax;
  const taxLabel = debt.tax > 0 ? "ضريبة القيمة المضافة" : "الضريبة";
  els.detailBody.innerHTML = `
    <div class="debt-detail__body">
      <div class="debt-detail__hero"><h3>${escapeHtml(debt.customer)}</h3><p>فاتورة ضريبية مبسطة</p></div>
      <div class="debt-detail__meta">
        <div><span>التاريخ</span><strong class="num">${escapeHtml(debt.date)}</strong></div>
        <div><span>الوقت</span><strong class="num">${escapeHtml(debt.time)}</strong></div>
        <div><span>رقم الفاتورة</span><strong class="num">#${escapeHtml(debt.invoiceNumber)}</strong></div>
        <div><span>اسم العميل</span><strong>${escapeHtml(debt.customer)}</strong></div>
      </div>
      <div class="debt-items">
        <div class="debt-items__row is-head"><span>اسم المنتج</span><span>الكمية</span><span>السعر (ج.م)</span><span>الإجمالي (ج.م)</span></div>
        ${debt.items.length ? debt.items.map(item => `<div class="debt-items__row"><span>${escapeHtml(item.name)}<small>${escapeHtml(item.sku)}</small></span><span class="num">${item.qty}</span><span class="num">${formatMoney(item.price)}</span><span class="num">${formatMoney(item.total)}</span></div>`).join("") : '<div class="debt-items__empty">لا تتوفر تفاصيل أصناف هذه الفاتورة.</div>'}
      </div>
      <div class="debt-detail__totals">
        <section class="debt-balance-card"><div><span>المبلغ المدفوع</span><strong class="num">${formatMoney(debt.paid)} ج.م</strong></div><div class="is-danger"><span>المتبقي</span><strong class="num">${formatMoney(debt.remaining)} ج.م</strong></div></section>
        <section class="debt-total-card"><div><span>الإجمالي الفرعي</span><strong class="num">${formatMoney(subtotal)}</strong></div><div><span>الخصم</span><strong class="num">${formatMoney(debt.discount)}</strong></div><div><span>${taxLabel}</span><strong class="num">${formatMoney(debt.tax)}</strong></div><div class="debt-total-card__final"><span>الإجمالي النهائي</span><strong class="num">${formatMoney(debt.total)}</strong></div></section>
      </div>
    </div>`;
  els.detailOverlay.hidden = false;
}

function closeDetail() {
  els.detailOverlay.hidden = true;
}

function openPayment(debt) {
  state.currentDebt = debt;
  state.paymentMethod = "cash";
  closeDetail();
  renderPayment();
  els.paymentOverlay.hidden = false;
}

function renderPayment() {
  const debt = state.currentDebt;
  if (!debt) return;
  els.paymentBody.innerHTML = `
    <div class="debt-payment__customer"><h3>${escapeHtml(debt.customer)}</h3><p>رقم الفاتورة: <span class="num">#${escapeHtml(debt.invoiceNumber)}</span></p></div>
    <div class="debt-payment__stats">
      <div class="debt-payment__stat"><span>المبلغ الإجمالي</span><strong class="num">${formatMoney(debt.total)} ج.م</strong></div>
      <div class="debt-payment__stat"><span>المدفوع سابقًا</span><strong class="num">${formatMoney(debt.paid)} ج.م</strong></div>
      <div class="debt-payment__stat is-remaining"><span>المبلغ المتبقي</span><strong class="num">${formatMoney(debt.remaining)} ج.م</strong></div>
    </div>
    <div class="debt-payment__amount"><label for="debtPaymentAmount">المبلغ المراد تسديده الآن</label><div class="debt-amount-input"><input class="num" id="debtPaymentAmount" type="number" min="1" max="${debt.remaining}" value="${debt.remaining}" /><span>ج.م</span></div><p class="debt-payment__error" id="debtPaymentError"></p></div>
    <p class="debt-payment__method-title">طريقة الدفع</p>
    <div class="debt-methods">
      ${paymentMethodButton("cash", "نقدي", cashIcon())}
      ${paymentMethodButton("wallet", "محفظة", walletIcon())}
      ${paymentMethodButton("instapay", "إنستا باي", instaIcon())}
    </div>`;
}

function paymentMethodButton(value, label, icon) {
  return `<button class="debt-method${state.paymentMethod === value ? " is-active" : ""}" type="button" data-method="${value}">${icon}<span>${label}</span></button>`;
}

function cashIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>'; }
function walletIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><circle cx="16" cy="14" r="1"/></svg>'; }
function instaIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="m9 12 2 2 4-4"/></svg>'; }

function closePayment() {
  els.paymentOverlay.hidden = true;
}

async function confirmPayment() {
  const debt = state.currentDebt;
  const amountInput = document.getElementById("debtPaymentAmount");
  const error = document.getElementById("debtPaymentError");
  const amount = Number(amountInput && amountInput.value);
  if (!amount || amount <= 0 || amount > debt.remaining) {
    error.textContent = `أدخل مبلغًا من 1 إلى ${formatMoney(debt.remaining)} ج.م`;
    return;
  }
  els.confirmPayment.disabled = true;
  try {
    await api.post(`/api/v1/debts/${encodeURIComponent(debt.id)}/payments`, { amount, method: state.paymentMethod, idempotency_key: idempotencyKey() });
    closePayment();
    await loadDebts();
    showToast("تم تسجيل الدفعة بنجاح");
  } catch (apiError) { error.textContent = apiError.message; }
  finally { els.confirmPayment.disabled = false; }
}

function printDebt(debt) {
  if (window.GhaithPrint) {
    window.GhaithPrint.printReceipt({title:"فاتورة مديونية",number:debt.invoiceNumber,customer:debt.customer,items:debt.items.map(item=>({name:item.name,qty:item.qty,price:item.price})),totals:[{label:"الإجمالي",value:debt.total},{label:"المدفوع",value:debt.paid},{label:"المتبقي",value:debt.remaining,final:true}],note:"يرجى سداد المبلغ المتبقي في الموعد المتفق عليه"});
    return;
  }
  els.printArea.innerHTML = `<section class="debt-print"><h1>غيث</h1><h2>فاتورة رقم #${escapeHtml(debt.invoiceNumber)}</h2><p>${escapeHtml(debt.customer)}</p>${debt.items.map(item => `<div><span>${escapeHtml(item.name)} × ${item.qty}</span><strong>${formatMoney(item.price * item.qty)} ج.م</strong></div>`).join("")}<hr><div><span>الإجمالي</span><strong>${formatMoney(debt.total)} ج.م</strong></div><div><span>المدفوع</span><strong>${formatMoney(debt.paid)} ج.م</strong></div><div><span>المتبقي</span><strong>${formatMoney(debt.remaining)} ج.م</strong></div></section>`;
  window.print();
}

els.debtsList.addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const debt = findDebtFromTarget(button);
  if (!debt) return;
  if (button.dataset.action === "view") openDetail(debt);
  if (button.dataset.action === "pay") openPayment(debt);
  if (button.dataset.action === "remind") {
    button.disabled = true;
    try { await api.post(`/api/v1/debts/${encodeURIComponent(debt.id)}/reminder`); showToast(`تم إرسال تذكير إلى ${debt.customer}`); }
    catch (error) { showToast(error.message, "error"); }
    finally { button.disabled = false; }
  }
});

els.search.addEventListener("input", debounce(() => {
  state.query = els.search.value;
  renderDebts();
}, 350));

els.dateFilter.addEventListener("change", () => {
  state.dateFilter = els.dateFilter.value;
  renderDebts();
});

els.cashierFilter.addEventListener("change", () => {
  state.cashierFilter = els.cashierFilter.value;
  renderDebts();
});

els.refresh.addEventListener("click", loadDebts);
els.startNewSale?.addEventListener("click", event => {
  event.preventDefault();
  if (document.documentElement.dataset.cashierSpa === "true") window.location.hash = "pos";
  else window.location.href = "../cashier.html#pos";
});

els.closeDetail.addEventListener("click", closeDetail);
els.cancelDetail.addEventListener("click", closeDetail);
els.detailOverlay.addEventListener("click", event => { if (event.target === els.detailOverlay) closeDetail(); });
els.detailPay.addEventListener("click", () => { if (state.currentDebt) openPayment(state.currentDebt); });
els.detailPrint.addEventListener("click", () => { if (state.currentDebt) printDebt(state.currentDebt); });
els.closePayment.addEventListener("click", closePayment);
els.cancelPayment.addEventListener("click", closePayment);
els.paymentOverlay.addEventListener("click", event => { if (event.target === els.paymentOverlay) closePayment(); });
els.confirmPayment.addEventListener("click", confirmPayment);
els.paymentBody.addEventListener("click", event => {
  const button = event.target.closest("[data-method]");
  if (!button) return;
  state.paymentMethod = button.dataset.method;
  renderPayment();
});

loadDebts();
