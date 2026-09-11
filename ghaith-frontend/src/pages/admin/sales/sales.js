import { api, listFrom } from "../../../core/api.js";
import { debounce, escapeHtml } from "../../../core/utils.js";

const money = value => `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} EGP`;
const dateLabel = value => value ? new Date(value).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—";
const PERIOD_LABELS = { today: "اليوم", yesterday: "أمس", this_week: "هذا الأسبوع", this_month: "هذا الشهر", last_30_days: "آخر 30 يومًا" };

function renderRows(body, invoices) {
  body.innerHTML = invoices.map(invoice => {
    const customer = invoice.customer || {}, cashier = invoice.cashier || invoice.created_by || {}, salesPerson = invoice.sales_person || {};
    const count = invoice.items_count ?? invoice.item_count ?? invoice.items?.length ?? 0;
    return `<tr data-id="${escapeHtml(invoice.id)}"><td><b dir="ltr">#${escapeHtml(invoice.invoice_number || invoice.number || "—")}</b></td><td>${dateLabel(invoice.created_at || invoice.invoice_date)}</td><td>${escapeHtml(cashier.name || cashier.username || invoice.cashier_name || "—")}</td><td>${escapeHtml(salesPerson.name || salesPerson.username || invoice.sales_person_name || "—")}</td><td>${escapeHtml(customer.name || invoice.customer_name || "عميل نقدي")}</td><td class="num" dir="ltr">${escapeHtml(customer.phone || invoice.customer_phone || "—")}</td><td>${count}</td><td>${escapeHtml(invoice.payment_method || "—")}</td><td dir="ltr">${money(invoice.subtotal)}</td><td>${money(invoice.discount_amount)}</td><td class="sales-net" dir="ltr">${money(invoice.total_amount ?? invoice.total)}</td><td>${money(invoice.paid_amount)}</td><td>${money(invoice.remaining_amount)}</td><td>${escapeHtml(invoice.status || "—")}</td><td><button class="sales-view" type="button" aria-label="عرض الفاتورة">⌕</button></td></tr>`;
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
      const invoices = listFrom(response); currentSummary = summary?.summary || summary; renderRows(body, invoices); renderSummary(currentSummary);
      empty.hidden = invoices.length > 0; body.hidden = !invoices.length; info.textContent = invoices.length ? `عرض ${invoices.length} من أصل ${response.total ?? invoices.length} نتيجة` : "لا توجد نتائج";
    } catch (error) { body.innerHTML = ""; empty.hidden = false; empty.querySelector("p").textContent = error.message; }
  };
  const delayedLoad = debounce(load, 300);
  const open = async id => { try { const response = await api.get(`/api/v1/admin/sales/${encodeURIComponent(id)}`); activeInvoice = response?.invoice || response?.data || response; renderInvoiceModal(activeInvoice); modal.hidden = false; document.body.style.overflow = "hidden"; } catch (error) { window.alert(error.message); } };
  const close = () => { modal.hidden = true; document.body.style.overflow = ""; };
  const onBody = event => { const button = event.target.closest(".sales-view"); if (button) open(button.closest("tr").dataset.id); };
  const periods = document.querySelector(".sales-periods");
  const onPeriods = event => { const button = event.target.closest("[data-period]"); if (!button) return; period = button.dataset.period; periods.querySelectorAll("button").forEach(item => item.classList.toggle("is-active", item === button)); load(); };
  const loadExportRows = async () => {
    const pageSize = 100, first = await api.get("/api/v1/admin/sales", { query: queryFor(1, pageSize) }), rows = listFrom(first), total = Number(first.total ?? rows.length), pages = Math.ceil(total / pageSize);
    for (let page = 2; page <= pages; page += 1) rows.push(...listFrom(await api.get("/api/v1/admin/sales", { query: queryFor(page, pageSize) })));
    return rows;
  };
  const exportSubtitle = () => [`الفترة: ${PERIOD_LABELS[period] || period}`, payment.value ? `طريقة الدفع: ${payment.selectedOptions[0]?.textContent}` : "", status.value ? `الحالة: ${status.selectedOptions[0]?.textContent}` : "", search.value.trim() ? `البحث: ${search.value.trim()}` : ""].filter(Boolean).join(" · ");
  const exportSummary = () => [["إجمالي المبيعات", currentSummary.total_sales], ["صافي المبيعات", currentSummary.net_sales], ["عدد الفواتير", currentSummary.invoice_count], ["إجمالي الخصومات", currentSummary.total_discounts]].filter(([, value]) => value !== undefined).map(([label, value]) => ({ label, value: label === "عدد الفواتير" ? Number(value).toLocaleString("en-US") : money(value) }));
  const runExport = async (button, type) => {
    const original = button.innerHTML; button.disabled = true; button.textContent = "جاري تجهيز الملف...";
    try {
      const invoices = await loadExportRows(), table = createExportTable(invoices), subtitle = exportSubtitle();
      if (type === "pdf") window.GhaithPrint?.printTable({ title: "تقرير المبيعات", subtitle, table, summary: exportSummary(), wide: true });
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
