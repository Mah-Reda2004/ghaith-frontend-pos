import { api, listFrom } from "../../../core/api.js";
import { debounce, escapeHtml } from "../../../core/utils.js";

const money = value => `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} EGP`;
const dateLabel = value => value ? new Date(value).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—";
const PERIOD_LABELS = { today: "اليوم", yesterday: "أمس", this_week: "هذا الأسبوع", this_month: "هذا الشهر", last_30_days: "آخر 30 يومًا" };
const PAYMENT_LABELS = { cash: "نقدي", card: "بطاقة", wallet: "محفظة", transfer: "تحويل", bank: "تحويل بنكي", instapay: "إنستا باي", deferred: "آجل", mixed: "دفع مختلط", store_credit: "رصيد متجر", exchange_credit: "رصيد استبدال" };
const STATUS_LABELS = { completed: "مكتملة", pending: "قيد الانتظار", pending_payment: "قيد الدفع", deferred: "آجل", cancelled: "ملغاة", void: "ملغاة", returned: "مرتجعة", partially_returned: "مرتجعة جزئيًا", fully_returned: "مرتجعة بالكامل", refunded: "تم رد المبلغ" };
const references = { users: new Map(), customers: new Map(), variants: new Map(), customerTypes: new Map(), promise: null };

const personName = person => typeof person === "string" ? person : person?.name || person?.full_name || person?.username || "";

async function loadReferenceData() {
  if (references.promise) return references.promise;
  const paged = async (path, query = {}) => {
    const first = await api.get(path, { query: { ...query, page: 1, page_size: 100 } });
    const pages = [first], total = Number(first?.total ?? first?.data?.total ?? listFrom(first).length);
    for (let page = 2; page <= Math.ceil(total / 100); page += 1) pages.push(await api.get(path, { query: { ...query, page, page_size: 100 } }));
    return pages.flatMap(listFrom);
  };
  references.promise = Promise.allSettled([
    paged("/api/v1/admin/users"), paged("/api/v1/customers"), paged("/api/v1/pos/catalog"), api.get("/api/v1/customer-types")
  ]).then(([users, customers, catalog, customerTypes]) => {
    if (users.status === "fulfilled") references.users = new Map(users.value.map(entry => { const user = entry.user || entry; return [String(user.id || user.user_id || entry.user_id), personName(user)]; }).filter(([id, name]) => id && name));
    if (customers.status === "fulfilled") references.customers = new Map(customers.value.map(customer => [String(customer.id), customer]));
    if (catalog.status === "fulfilled") {
      const variants = catalog.value.flatMap(product => (product.variants || product.product_variants || [product]).map(variant => ({ ...variant, name: product.name_ar || product.name || variant.name_ar || variant.name, category_name: product.category?.name || product.category_name, product })));
      references.variants = new Map(variants.map(variant => [String(variant.variant_id || variant.id), variant]));
    }
    if (customerTypes.status === "fulfilled") references.customerTypes = new Map(listFrom(customerTypes.value).map(type => [String(type.id), type]));
  });
  return references.promise;
}

function invoiceItems(invoice) {
  return invoice.items || invoice.invoice_items || invoice.sale_items || invoice.lines || [];
}

function invoiceItemCount(invoice) {
  const explicit = invoice.items_count ?? invoice.item_count ?? invoice.products_count ?? invoice.products_count_total ?? invoice.total_items ?? invoice.total_quantity;
  if (explicit !== undefined && explicit !== null) return Number(explicit) || 0;
  return invoiceItems(invoice).reduce((total, item) => total + Number(item.quantity ?? item.qty ?? 1), 0);
}

function invoicePaymentMethod(invoice) {
  if (Array.isArray(invoice.payment_methods) && invoice.payment_methods.length) {
    return invoice.payment_methods.map(method => PAYMENT_LABELS[method] || method).join(" + ");
  }
  const payment = invoice.payment || invoice.payment_details || invoice.payments?.[0] || {};
  const method = invoice.payment_method ?? invoice.method ?? payment.method ?? payment.payment_method;
  return PAYMENT_LABELS[method] || method || "—";
}

function needsInvoiceDetails(invoice) {
  const hasCount = [invoice.items_count, invoice.item_count, invoice.products_count, invoice.products_count_total, invoice.total_items, invoice.total_quantity].some(value => value !== undefined && value !== null) || invoiceItems(invoice).length > 0;
  const payment = invoice.payment || invoice.payment_details || invoice.payments?.[0] || {};
  const hasPayment = (Array.isArray(invoice.payment_methods) && invoice.payment_methods.length > 0) || invoice.payment_method != null || invoice.method != null || payment.method != null || payment.payment_method != null;
  const hasCustomer = invoice.customer != null || invoice.customer_name != null || invoice.customer_id == null;
  const hasCashier = invoice.cashier != null || invoice.cashier_name != null || invoice.created_by != null;
  const hasSales = invoice.sales_person != null || invoice.sales_person_name != null || invoice.sales_user != null;
  return !hasCount || !hasPayment || !hasCustomer || !hasCashier || !hasSales;
}

function enrichInvoice(invoice) {
  const customer = { ...(references.customers.get(String(invoice.customer_id || "")) || {}), ...(typeof invoice.customer === "object" && invoice.customer ? invoice.customer : {}) };
  const cashierId = invoice.cashier_id || invoice.created_by_id || invoice.cashier?.id || invoice.created_by?.id;
  const salesId = invoice.sales_person_id || invoice.sales_user_id || invoice.sales_person?.id || invoice.sales_user?.id;
  const items = invoiceItems(invoice).map(item => ({ ...references.variants.get(String(item.variant_id || item.product_variant_id || item.variant?.id || "")), ...item }));
  const discountRecord = typeof invoice.discount === "object" && invoice.discount ? invoice.discount : {};
  const discount = Number(invoice.discount_amount ?? discountRecord.amount ?? (typeof invoice.discount === "number" ? invoice.discount : 0));
  const customerType = customer.customer_type || references.customerTypes.get(String(customer.customer_type_id || invoice.customer_type_id || "")) || {};
  const discountType = invoice.discount_type || invoice.discount_reason || discountRecord.label || discountRecord.name || discountRecord.type;
  const discountLabel = invoice.discount_label || (discountType === "percentage" ? `نسبة ${Number(discountRecord.value || customerType.discount_percent || 0)}%` : discountType === "amount" ? "مبلغ ثابت" : customerType.name ? customerType.name : discount > 0 ? "خصم الكاشير" : "بدون خصم");
  return { ...invoice, customer, items, discount, discountLabel, cashierName: references.users.get(String(cashierId || "")) || personName(invoice.cashier || invoice.created_by) || invoice.cashier_name || "—", salesName: references.users.get(String(salesId || "")) || personName(invoice.sales_person || invoice.sales_user) || invoice.sales_person_name || "—" };
}

async function hydrateInvoices(invoices) {
  return Promise.all(invoices.map(async invoice => {
    if (!invoice?.id || !needsInvoiceDetails(invoice)) return invoice;
    try {
      const response = await api.get(`/api/v1/admin/sales/${encodeURIComponent(invoice.id)}`);
      const details = response?.invoice || response?.data?.invoice || response?.data || response;
      return details && typeof details === "object" ? { ...invoice, ...details } : invoice;
    } catch {
      return invoice;
    }
  }));
}

function renderRows(body, invoices) {
  body.innerHTML = invoices.map(invoice => {
    const customer = invoice.customer || {};
    const count = invoiceItemCount(invoice);
    return `<tr data-id="${escapeHtml(invoice.id)}"><td><b dir="ltr">#${escapeHtml(invoice.invoice_number || invoice.number || "—")}</b></td><td>${dateLabel(invoice.created_at || invoice.invoice_date)}</td><td>${escapeHtml(invoice.cashierName)}</td><td>${escapeHtml(invoice.salesName)}</td><td>${escapeHtml(customer.name || invoice.customer_name || "عميل نقدي")}</td><td class="num" dir="ltr">${escapeHtml(customer.phone || invoice.customer_phone || "—")}</td><td>${count}</td><td>${escapeHtml(invoicePaymentMethod(invoice))}</td><td dir="ltr">${money(invoice.subtotal)}</td><td>${money(invoice.discount)}<small>${escapeHtml(invoice.discountLabel)}</small></td><td class="sales-net" dir="ltr">${money(invoice.net_total ?? invoice.total_amount ?? invoice.total)}</td><td>${money(invoice.paid_amount)}</td><td>${money(invoice.remaining_amount)}</td><td>${escapeHtml(STATUS_LABELS[invoice.status] || invoice.status || "—")}</td><td><button class="sales-view" type="button" aria-label="عرض الفاتورة">⌕</button></td></tr>`;
  }).join("");
}

function renderSummary(summary) {
  const values = [summary.total_sales, summary.net_sales, summary.invoice_count, summary.average_invoice, summary.total_discounts, summary.total_returns];
  document.querySelectorAll(".sales-stats strong").forEach((node, index) => {
    if (values[index] !== undefined) node.innerHTML = index === 2 ? String(values[index]) : `${Number(values[index]).toLocaleString("en-US")} <em>EGP</em>`;
  });
}

function renderInvoiceModal(invoice) {
  document.getElementById("invoiceTitle").textContent = `#${invoice.invoice_number || invoice.number || "—"}`;
  document.getElementById("invoiceCustomer").textContent = invoice.customer?.name || invoice.customer_name || "عميل نقدي";
  document.querySelector(".invoice-products").innerHTML = (invoice.items || invoice.invoice_items || []).map(item => `<div><strong>${escapeHtml(item.product_name || item.name || "منتج")}</strong><small dir="ltr">${escapeHtml(item.sku || "—")}</small><span>${Number(item.quantity || item.qty)} × ${money(item.unit_price || item.price)}</span><b>${money(item.line_total || Number(item.quantity || item.qty) * Number(item.unit_price || item.price))}</b></div>`).join("") || "<p>لا توجد بنود.</p>";
}

function createExportTable(invoices) {
  const source = document.querySelector(".sales-table"), table = document.createElement("table"), head = source.tHead.cloneNode(true), body = document.createElement("tbody");
  head.rows[0]?.lastElementChild?.remove();
  renderRows(body, invoices);
  [...body.rows].forEach(row => row.lastElementChild?.remove());
  table.append(head, body);
  return table;
}

export function initSales() {
  window.bindAdminThemeToggle?.(document.getElementById("salesThemeToggle"));
  const body = document.getElementById("salesTableBody"), search = document.getElementById("salesSearch"), payment = document.getElementById("salesPayment"), status = document.getElementById("salesStatus"), modal = document.getElementById("salesModal"), info = document.getElementById("salesResultInfo"), empty = document.getElementById("salesEmpty");
  let activeInvoice = null, period = "this_month", sequence = 0, currentSummary = {};
  const queryFor = (page = 1, pageSize = 50) => {
    const statusMap = { sale: "completed", return: "returned" };
    return { period, search: search.value.trim() || undefined, payment_method: payment.value || undefined, status: statusMap[status.value] || status.value || undefined, page, page_size: pageSize };
  };
  const load = async () => {
    const request = ++sequence;
    try {
      const query = queryFor();
      const [response, summary] = await Promise.all([api.get("/api/v1/admin/sales", { query }), api.get("/api/v1/admin/sales/summary", { query })]);
      if (request !== sequence) return;
      await loadReferenceData();
      const invoices = (await hydrateInvoices(listFrom(response))).map(enrichInvoice);
      if (request !== sequence) return;
      currentSummary = summary?.summary || summary; renderRows(body, invoices); renderSummary(currentSummary);
      empty.hidden = invoices.length > 0; body.hidden = !invoices.length; info.textContent = invoices.length ? `عرض ${invoices.length} من أصل ${response.total ?? invoices.length} نتيجة` : "لا توجد نتائج";
    } catch (error) { body.innerHTML = ""; empty.hidden = false; empty.querySelector("p").textContent = error.message; }
  };
  const delayedLoad = debounce(load, 300);
  const open = async id => { try { const response = await api.get(`/api/v1/admin/sales/${encodeURIComponent(id)}`); activeInvoice = enrichInvoice(response?.invoice || response?.data || response); renderInvoiceModal(activeInvoice); modal.hidden = false; document.body.style.overflow = "hidden"; } catch (error) { window.alert(error.message); } };
  const close = () => { modal.hidden = true; document.body.style.overflow = ""; };
  const onBody = event => { const button = event.target.closest(".sales-view"); if (button) open(button.closest("tr").dataset.id); };
  const periods = document.querySelector(".sales-periods");
  const onPeriods = event => { const button = event.target.closest("[data-period]"); if (!button) return; period = button.dataset.period; periods.querySelectorAll("button").forEach(item => item.classList.toggle("is-active", item === button)); load(); };
  const loadExportRows = async () => {
    const pageSize = 100, first = await api.get("/api/v1/admin/sales", { query: queryFor(1, pageSize) }), rows = listFrom(first), total = Number(first.total ?? rows.length), pages = Math.ceil(total / pageSize);
    for (let page = 2; page <= pages; page += 1) rows.push(...listFrom(await api.get("/api/v1/admin/sales", { query: queryFor(page, pageSize) })));
    await loadReferenceData();
    return (await hydrateInvoices(rows)).map(enrichInvoice);
  };
  const exportSubtitle = () => [`الفترة: ${PERIOD_LABELS[period] || period}`, payment.value ? `طريقة الدفع: ${payment.selectedOptions[0]?.textContent}` : "", status.value ? `الحالة: ${status.selectedOptions[0]?.textContent}` : "", search.value.trim() ? `البحث: ${search.value.trim()}` : ""].filter(Boolean).join(" · ");
  const exportSummary = () => [["إجمالي المبيعات", currentSummary.total_sales], ["صافي المبيعات", currentSummary.net_sales], ["عدد الفواتير", currentSummary.invoice_count], ["إجمالي الخصومات", currentSummary.total_discounts]].filter(([, value]) => value !== undefined).map(([label, value]) => ({ label, value: label === "عدد الفواتير" ? Number(value).toLocaleString("en-US") : money(value) }));
  const runExport = async (button, type) => {
    const original = button.innerHTML; button.disabled = true; button.textContent = "جاري تجهيز الملف...";
    try {
      const invoices = await loadExportRows(), table = createExportTable(invoices), subtitle = exportSubtitle();
      if (type === "pdf") await window.GhaithPrint?.exportTablePdf({ title: "تقرير المبيعات", subtitle, table, summary: exportSummary(), wide: true, fileName: "ghaith-sales" });
      else window.GhaithPrint?.exportTableExcel({ title: "تقرير المبيعات", subtitle, table, fileName: "ghaith-sales" });
    } catch (error) { window.alert(error.message); }
    finally { button.disabled = false; button.innerHTML = original; }
  };
  search.addEventListener("input", delayedLoad); payment.addEventListener("change", load); status.addEventListener("change", load); body.addEventListener("click", onBody); periods.addEventListener("click", onPeriods); modal.addEventListener("click", event => { if (event.target.closest("[data-close-modal]")) close(); });
  document.getElementById("printInvoice").addEventListener("click", async () => {
    if (!activeInvoice) return;
    try {
      const response = await api.get(`/api/v1/admin/sales/${encodeURIComponent(activeInvoice.id)}/print`);
      window.GhaithPrint?.printReceipt(response?.print || response?.data || response);
    } catch (error) { window.alert(error.message); }
  });
  document.getElementById("salesExportPdf").addEventListener("click", event => runExport(event.currentTarget, "pdf"));
  document.getElementById("salesExportExcel").addEventListener("click", event => runExport(event.currentTarget, "excel"));
  load();
  return () => { sequence++; document.body.style.overflow = ""; search.removeEventListener("input", delayedLoad); payment.removeEventListener("change", load); status.removeEventListener("change", load); body.removeEventListener("click", onBody); periods.removeEventListener("click", onPeriods); };
}
