import { api } from "../../../core/api.js";
import { debounce, escapeHtml, formatMoney } from "../../../core/utils.js";

const API_PAGE_SIZE = 100;
const UI_PAGE_SIZE = 20;
const INVOICE_PAGE_SIZE = 15;
let suppliers = [];
let products = [];
let summary = { total: 0, payables: 0, active: 0 };
let currentPage = 1;
let activeSupplier = null;
let requestSequence = 0;
const supplierBalances = new Map();
const supplierInvoicesById = new Map();

function addApiUi() {
  if (document.getElementById("supplierAddress")) return;
  const phoneField = document.getElementById("supplierPhone").closest(".field");
  phoneField.insertAdjacentHTML("afterend", '<div class="field"><label for="supplierAddress">العنوان</label><input class="input" id="supplierAddress" type="text" placeholder="عنوان المورد"></div>');
  ["supplierType", "supplierPaymentType", "supplierPurchases", "supplierPaid"].forEach(id => { const field = document.getElementById(id)?.closest(".field"); if (field) field.hidden = true; });
  const status = document.getElementById("supplierStatus");
  status.innerHTML = '<option value="active">نشط</option><option value="inactive">غير نشط</option>';
  document.getElementById("suppliersStatusFilter").innerHTML = '<option value="all">جميع الحالات</option><option value="active">نشط</option><option value="inactive">غير نشط</option>';
  document.querySelector(".suppliers-phone span")?.remove();
  document.querySelector(".suppliers-table thead").innerHTML = "<tr><th>اسم المورد</th><th>رقم الهاتف</th><th>العنوان</th><th>الملاحظات</th><th>تاريخ الإضافة</th><th>المبلغ المدفوع</th><th>المبلغ المتبقي</th><th>الحالة</th><th>الإجراءات</th></tr>";
  document.querySelector(".supplier-stat--purchases span").textContent = "إجمالي مستحقات الموردين";
  document.getElementById("newSupplierPayment").textContent = "+ فاتورة شراء جديدة";
  const purchaseSection = document.querySelector(".supplier-purchases");
  purchaseSection.querySelector("h2").textContent = "فواتير الشراء";
  purchaseSection.querySelector("thead").innerHTML = "<tr><th>رقم الفاتورة</th><th>هاتف المورد</th><th>تاريخ الفاتورة</th><th>تاريخ الاستحقاق</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>طريقة الدفع</th><th>الحالة</th></tr>";
  purchaseSection.querySelector("tbody").id = "supplierInvoicesBody";
  purchaseSection.querySelector("tfoot")?.remove();
  purchaseSection.insertAdjacentHTML("beforeend", '<footer class="pagination supplier-invoices-pagination" id="supplierInvoicesPagination" hidden><span class="pagination__info" id="supplierInvoicesPaginationInfo"></span><div class="pagination__pages" id="supplierInvoicesPaginationPages"></div></footer>');
  document.querySelector(".suppliers-page").insertAdjacentHTML("beforeend", `
    <div class="modal-overlay suppliers-modal" id="purchaseInvoiceModal" hidden><section class="modal suppliers-dialog purchase-dialog" role="dialog" aria-modal="true" aria-labelledby="purchaseInvoiceTitle">
      <header class="modal__header suppliers-dialog__header"><div><h2 class="modal__title" id="purchaseInvoiceTitle">إضافة فاتورة شراء</h2><p id="purchaseSupplierName">—</p></div><button class="btn-icon" id="closePurchaseInvoice" type="button" aria-label="إغلاق">×</button></header>
      <form id="purchaseInvoiceForm" novalidate><div class="suppliers-dialog__body">
        <p class="purchase-auto-number">رقم الفاتورة يُولّد تلقائيًا من الخادم عند الحفظ.</p><div class="suppliers-form-grid"><div class="field"><label for="purchasePaymentMethod">طريقة الدفع</label><select class="select" id="purchasePaymentMethod"><option value="cash">نقدي</option><option value="deferred">آجل</option></select></div><div class="field"><label for="purchasePaidAmount">المبلغ المدفوع</label><input class="input num" id="purchasePaidAmount" type="number" min="0" step="0.01" value="0"></div><div class="field" id="purchaseDueDateField"><label for="purchaseDueDate">تاريخ الاستحقاق</label><input class="input" id="purchaseDueDate" type="date"></div></div>
        <div class="purchase-lines-head"><h3>بنود الفاتورة</h3><button class="btn btn-outline" id="addPurchaseLine" type="button">+ إضافة بند</button></div><div id="purchaseLines"></div>
        <div class="field"><label for="purchaseNotes">ملاحظات</label><textarea class="input" id="purchaseNotes" rows="2"></textarea></div>
      </div><footer class="modal__actions suppliers-dialog__actions"><button class="btn btn-outline" id="cancelPurchaseInvoice" type="button">إلغاء</button><button class="btn btn-primary" id="savePurchaseInvoice" type="submit">حفظ الفاتورة</button></footer></form>
    </section></div>
    <div class="modal-overlay suppliers-modal" id="purchaseDetailModal" hidden><section class="modal suppliers-dialog purchase-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="purchaseDetailTitle">
      <header class="modal__header suppliers-dialog__header"><div><h2 class="modal__title" id="purchaseDetailTitle">تفاصيل فاتورة الشراء</h2><p id="purchaseDetailMeta">—</p></div><button class="btn-icon" id="closePurchaseDetail" type="button" aria-label="إغلاق">×</button></header>
      <div class="suppliers-dialog__body"><div class="purchase-detail-summary" id="purchaseDetailSummary"></div><h3 class="purchase-section-title">منتجات الفاتورة</h3><div class="table-responsive"><table class="data-table"><thead><tr><th>المنتج</th><th>التصنيف</th><th>المقاس</th><th>اللون</th><th>SKU / الباركود</th><th>الكمية</th><th>سعر الوحدة</th><th>خصم البند</th><th>الإجمالي</th></tr></thead><tbody id="purchaseDetailItems"></tbody></table></div><section class="purchase-payments"><div class="purchase-lines-head"><h3>دفعات الفاتورة</h3><span id="purchasePaymentBalance"></span></div><div class="table-responsive"><table class="data-table"><thead><tr><th>تاريخ الدفعة</th><th>المبلغ</th><th>طريقة الدفع</th><th>المرجع</th></tr></thead><tbody id="purchasePaymentsBody"></tbody></table></div><form class="purchase-payment-form" id="purchasePaymentForm"><p class="purchase-payment-notice" id="purchasePaymentNotice" role="status" hidden></p><div class="field"><label for="purchasePaymentAmount">قيمة الدفعة</label><input class="input num" id="purchasePaymentAmount" type="number" min="0.01" step="0.01" required></div><div class="field"><label for="purchasePaymentMethodDetail">طريقة الدفع</label><select class="select" id="purchasePaymentMethodDetail"><option value="cash">نقدي</option><option value="bank">بنك</option><option value="transfer">تحويل</option><option value="wallet">محفظة</option><option value="card">بطاقة</option><option value="instapay">إنستا باي</option></select></div><div class="field"><label for="purchasePaymentReference">مرجع الدفع (اختياري)</label><input class="input" id="purchasePaymentReference" type="text"></div><button class="btn btn-primary" id="savePurchasePayment" type="submit">تسجيل الدفعة</button></form></section><div class="supplier-detail__notes"><h2>ملاحظات الفاتورة</h2><p id="purchaseDetailNotes">—</p></div></div>
    </section></div>
    <div class="modal-overlay suppliers-modal" id="supplierDeactivateModal" hidden><section class="modal suppliers-confirm" role="alertdialog" aria-modal="true" aria-labelledby="supplierDeactivateTitle"><span class="suppliers-confirm__icon">!</span><h2 id="supplierDeactivateTitle">أرشفة المورد؟</h2><p>سيتم أرشفة <b id="supplierDeactivateName"></b> وإزالته من قائمة الموردين النشطين.</p><div><button class="btn btn-outline" id="cancelSupplierDeactivate" type="button">إلغاء</button><button class="btn suppliers-confirm__submit" id="confirmSupplierDeactivate" type="button">أرشفة المورد</button></div></section></div>`);
  const paymentSection = document.querySelector("#purchaseDetailModal .purchase-payments");
  const detailSummary = document.getElementById("purchaseDetailSummary");
  if (paymentSection && detailSummary) {
    paymentSection.querySelector("h3").textContent = "سداد دفعة على هذه الفاتورة";
    detailSummary.after(paymentSection);
  }
}

function getElements() {
  addApiUi();
  return {
    listView: document.getElementById("suppliersListView"), detailView: document.getElementById("supplierDetailView"), stateView: document.getElementById("suppliersViewState"),
    tableBody: document.getElementById("suppliersTableBody"), empty: document.getElementById("suppliersEmpty"), search: document.getElementById("suppliersSearch"), statusFilter: document.getElementById("suppliersStatusFilter"), paginationInfo: document.getElementById("suppliersPaginationInfo"), pagination: document.querySelector(".suppliers-pagination .pagination__pages"),
    totalStat: document.getElementById("suppliersTotalStat"), purchasesStat: document.getElementById("suppliersPurchasesStat"), activeStat: document.getElementById("suppliersActiveStat"),
    detailName: document.getElementById("supplierDetailName"), detailType: document.getElementById("supplierDetailType"), detailStatus: document.getElementById("supplierDetailStatus"), detailId: document.getElementById("supplierDetailId"), detailDate: document.getElementById("supplierDetailDate"), detailTotal: document.getElementById("detailTotal"), detailPaid: document.getElementById("detailPaid"), detailBalance: document.getElementById("detailBalance"), detailNotes: document.getElementById("supplierDetailNotes"), invoicesBody: document.getElementById("supplierInvoicesBody"), invoicesPagination: document.getElementById("supplierInvoicesPagination"), invoicesPaginationInfo: document.getElementById("supplierInvoicesPaginationInfo"), invoicesPaginationPages: document.getElementById("supplierInvoicesPaginationPages"),
    modal: document.getElementById("supplierModal"), modalTitle: document.getElementById("supplierModalTitle"), form: document.getElementById("supplierForm"), id: document.getElementById("supplierId"), name: document.getElementById("supplierName"), phone: document.getElementById("supplierPhone"), address: document.getElementById("supplierAddress"), status: document.getElementById("supplierStatus"), notes: document.getElementById("supplierNotes"), nameError: document.getElementById("supplierNameError"), toastStack: document.getElementById("suppliersToastStack"),
    purchaseModal: document.getElementById("purchaseInvoiceModal"), purchaseForm: document.getElementById("purchaseInvoiceForm"), paymentMethod: document.getElementById("purchasePaymentMethod"), paidAmount: document.getElementById("purchasePaidAmount"), dueDate: document.getElementById("purchaseDueDate"), dueDateField: document.getElementById("purchaseDueDateField"), purchaseNotes: document.getElementById("purchaseNotes"), purchaseLines: document.getElementById("purchaseLines"), savePurchase: document.getElementById("savePurchaseInvoice"),
    purchaseDetailModal: document.getElementById("purchaseDetailModal"), purchaseDetailMeta: document.getElementById("purchaseDetailMeta"), purchaseDetailSummary: document.getElementById("purchaseDetailSummary"), purchaseDetailItems: document.getElementById("purchaseDetailItems"), purchaseDetailNotes: document.getElementById("purchaseDetailNotes"), paymentsBody: document.getElementById("purchasePaymentsBody"), paymentForm: document.getElementById("purchasePaymentForm"), paymentNotice: document.getElementById("purchasePaymentNotice"), paymentAmount: document.getElementById("purchasePaymentAmount"), paymentDetailMethod: document.getElementById("purchasePaymentMethodDetail"), paymentReference: document.getElementById("purchasePaymentReference"), paymentBalance: document.getElementById("purchasePaymentBalance"), savePayment: document.getElementById("savePurchasePayment"), deactivateModal: document.getElementById("supplierDeactivateModal"), deactivateName: document.getElementById("supplierDeactivateName")
  };
}

const money = formatMoney;
const listFrom = response => Array.isArray(response) ? response : response?.items || response?.payments || response?.invoices || response?.data?.items || response?.data?.payments || response?.data?.invoices || [];
const dateLabel = value => value ? new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date(value)) : "—";
function showToast(elements, message, error = false) { const toast = document.createElement("div"); toast.className = `toast${error ? " is-error" : ""}`; toast.textContent = message; elements.toastStack.append(toast); setTimeout(() => toast.remove(), 3200); }

function normalizeSupplier(item) { return { id: item.id, name: item.name || "—", phone: item.phone || "—", address: item.address || "", notes: item.notes || "", status: item.status || "active", createdAt: item.created_at, version: Number(item.version || 1), totalPurchases: Number(item.total_purchases || 0), totalPaid: Number(item.total_paid || 0), balanceDue: Number(item.balance_due || 0) }; }

const PAYMENT_LABELS = { cash: "نقدي", bank: "بنك", transfer: "تحويل", wallet: "محفظة", card: "بطاقة", instapay: "إنستا باي", deferred: "آجل" };
const STATUS_LABELS = { draft: "مسودة", unpaid: "غير مدفوعة", deferred: "غير مدفوعة", partial: "مدفوعة جزئيًا", partially_paid: "مدفوعة جزئيًا", paid: "مدفوعة بالكامل", fully_paid: "مدفوعة بالكامل", approved: "معتمدة", overdue: "متأخرة", void: "ملغاة", voided: "ملغاة", cancelled: "ملغاة" };
function amount(invoice, ...keys) { for (const key of keys) if (invoice?.[key] != null) return Number(invoice[key]) || 0; return 0; }
function invoiceDueState(invoice) { const remaining = amount(invoice, "remaining_amount", "balance_due"); const raw = String(invoice.status || invoice.payment_status || "").toLowerCase(); if (["void", "voided", "cancelled", "draft"].includes(raw)) return raw; if (remaining <= 0) return "paid"; if (invoice.due_date) { const due = new Date(`${invoice.due_date}T23:59:59`); const today = new Date(); const days = Math.ceil((due - today) / 86400000); if (days < 0) return "overdue"; if (days <= 5) return "due-soon"; } return amount(invoice, "paid_amount", "total_paid") > 0 ? "partial" : "unpaid"; }
function statusMarkup(invoice) { const state = invoiceDueState(invoice); const label = state === "due-soon" ? "يستحق خلال 5 أيام" : STATUS_LABELS[state] || STATUS_LABELS[String(invoice.status || "").toLowerCase()] || invoice.status || "—"; return `<span class="purchase-status purchase-status--${escapeHtml(state)}">${escapeHtml(label)}</span>`; }

function renderSummary(elements) {
  elements.totalStat.textContent = summary.total.toLocaleString("en-US"); elements.purchasesStat.textContent = money(summary.payables); elements.activeStat.textContent = summary.active.toLocaleString("en-US");
}

function renderSuppliersLegacy(elements) {
  const start = (currentPage - 1) * UI_PAGE_SIZE; const rows = suppliers.slice(start, start + UI_PAGE_SIZE);
  elements.tableBody.innerHTML = rows.map(supplier => { const balance = supplierBalances.get(String(supplier.id)); return `<tr data-supplier-id="${escapeHtml(String(supplier.id))}"><td><button class="supplier-name-button" type="button" data-action="view">${escapeHtml(supplier.name)}</button></td><td class="num" dir="ltr">${escapeHtml(supplier.phone)}</td><td>${escapeHtml(supplier.address || "—")}</td><td>${escapeHtml(supplier.notes || "—")}</td><td>${dateLabel(supplier.createdAt)}</td><td class="num">${supplier.version}</td><td class="num supplier-paid">${balance ? money(balance.paid) : "…"}</td><td class="num supplier-balance">${balance ? money(balance.remaining) : "…"}</td><td><button class="status-toggle status-toggle--table${supplier.status === "active" ? "" : " is-inactive"}" type="button" role="switch" aria-checked="${supplier.status === "active"}" data-action="toggle-status"><span class="status-toggle__label">${supplier.status === "active" ? "نشط" : "غير نشط"}</span><span class="status-toggle__track" aria-hidden="true"><span class="status-toggle__thumb"></span></span></button></td><td><div class="suppliers-actions"><button class="suppliers-action suppliers-action--edit" type="button" data-action="edit" aria-label="تعديل"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="suppliers-action suppliers-action--delete" type="button" data-action="deactivate" aria-label="أرشفة"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11h5"/></svg></button></div></td></tr>`; }).join("");
  elements.tableBody.querySelectorAll("tr[data-supplier-id] .suppliers-actions").forEach(actions => {
    const invoicesButton = document.createElement("button");
    invoicesButton.className = "btn btn-outline supplier-invoices-button";
    invoicesButton.type = "button";
    invoicesButton.dataset.action = "view";
    invoicesButton.setAttribute("aria-label", "فتح فواتير المورد");
    invoicesButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 2h9l3 3v17H6z"/><path d="M14 2v4h4M9 11h6M9 15h6"/></svg><span>الفواتير</span>';
    actions.prepend(invoicesButton);
  });
  elements.empty.hidden = rows.length > 0; elements.tableBody.hidden = rows.length === 0; elements.paginationInfo.textContent = rows.length ? `عرض ${start + 1} إلى ${start + rows.length} من ${suppliers.length} مورد` : "لا توجد نتائج مطابقة";
  const pagesCount = Math.max(1, Math.ceil(suppliers.length / UI_PAGE_SIZE)); currentPage = Math.min(currentPage, pagesCount); const pages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pagesCount])].filter(page => page > 0 && page <= pagesCount).sort((a,b) => a-b);
  elements.pagination.innerHTML = `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>›</button>${pages.map(page => `<button class="page-btn${page === currentPage ? " is-active" : ""}" data-page="${page}">${page}</button>`).join("")}<button class="page-btn" data-page="${currentPage + 1}" ${currentPage === pagesCount ? "disabled" : ""}>‹</button>`; renderSummary(elements);
}

async function fetchAll(path, query = {}) { const first = await api.get(path, { query: { ...query, page: 1, page_size: API_PAGE_SIZE } }); const count = Math.ceil(Number(first.total || listFrom(first).length) / API_PAGE_SIZE); const rest = count > 1 ? await Promise.all(Array.from({ length: count - 1 }, (_, i) => api.get(path, { query: { ...query, page: i + 2, page_size: API_PAGE_SIZE } }))) : []; return [first, ...rest].flatMap(listFrom); }

function renderSuppliers(elements) {
  const start = (currentPage - 1) * UI_PAGE_SIZE;
  const rows = suppliers.slice(start, start + UI_PAGE_SIZE);
  elements.tableBody.innerHTML = rows.map(supplier => {
    const balance = supplierBalances.get(String(supplier.id));
    return `<tr data-supplier-id="${escapeHtml(String(supplier.id))}">
      <td><button class="supplier-name-button" type="button" data-action="view">${escapeHtml(supplier.name)}</button></td>
      <td><div class="suppliers-actions"><button class="btn btn-outline supplier-invoices-button" type="button" data-action="view" aria-label="فتح فواتير المورد"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 2h9l3 3v17H6z"/><path d="M14 2v4h4M9 11h6M9 15h6"/></svg><span>الفواتير</span></button><button class="suppliers-action suppliers-action--edit" type="button" data-action="edit" aria-label="تعديل"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="suppliers-action suppliers-action--delete" type="button" data-action="deactivate" aria-label="أرشفة"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11h5"/></svg></button></div></td>
      <td class="num" dir="ltr">${escapeHtml(supplier.phone)}</td><td>${escapeHtml(supplier.address || "—")}</td><td>${escapeHtml(supplier.notes || "—")}</td><td>${dateLabel(supplier.createdAt)}</td><td class="num supplier-paid">${balance ? money(balance.paid) : "…"}</td><td class="num supplier-balance">${balance ? money(balance.remaining) : "…"}</td><td><button class="status-toggle status-toggle--table${supplier.status === "active" ? "" : " is-inactive"}" type="button" role="switch" aria-checked="${supplier.status === "active"}" data-action="toggle-status"><span class="status-toggle__label">${supplier.status === "active" ? "نشط" : "غير نشط"}</span><span class="status-toggle__track" aria-hidden="true"><span class="status-toggle__thumb"></span></span></button></td>
    </tr>`;
  }).join("");
  elements.tableBody.querySelectorAll("tr[data-supplier-id]").forEach(row => row.append(row.children[1]));
  elements.empty.hidden = rows.length > 0; elements.tableBody.hidden = rows.length === 0; elements.paginationInfo.textContent = rows.length ? `عرض ${start + 1} إلى ${start + rows.length} من ${suppliers.length} مورد` : "لا توجد نتائج مطابقة";
  const pagesCount = Math.max(1, Math.ceil(suppliers.length / UI_PAGE_SIZE)); currentPage = Math.min(currentPage, pagesCount); const pages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pagesCount])].filter(page => page > 0 && page <= pagesCount).sort((a, b) => a - b);
  elements.pagination.innerHTML = `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>›</button>${pages.map(page => `<button class="page-btn${page === currentPage ? " is-active" : ""}" data-page="${page}">${page}</button>`).join("")}<button class="page-btn" data-page="${currentPage + 1}" ${currentPage === pagesCount ? "disabled" : ""}>‹</button>`; renderSummary(elements);
}

async function loadVisibleBalances(elements) {
  const start = (currentPage - 1) * UI_PAGE_SIZE;
  const visible = suppliers.slice(start, start + UI_PAGE_SIZE).filter(supplier => !supplierBalances.has(String(supplier.id)));
  if (!visible.length) return;
  await Promise.all(visible.map(async supplier => {
    try { const invoices = await fetchAll(`/api/v1/admin/suppliers/${encodeURIComponent(supplier.id)}/purchase-invoices`); supplierBalances.set(String(supplier.id), { paid: invoices.reduce((sum, invoice) => sum + amount(invoice, "paid_amount", "total_paid"), 0), remaining: invoices.reduce((sum, invoice) => sum + amount(invoice, "remaining_amount", "balance_due"), 0) }); }
    catch { supplierBalances.set(String(supplier.id), { paid: supplier.totalPaid, remaining: supplier.balanceDue }); }
  }));
  renderSuppliers(elements);
}

async function loadSuppliers(elements) {
  const sequence = ++requestSequence; elements.paginationInfo.textContent = "جاري تحميل الموردين...";
  try { const search = elements.search.value.trim(), query = { search: search || undefined, status: elements.statusFilter.value === "all" ? undefined : elements.statusFilter.value }; const [items, stats] = await Promise.all([fetchAll("/api/v1/admin/suppliers", query), api.get("/api/v1/admin/suppliers/summary")]); if (sequence !== requestSequence) return; suppliers = items.map(normalizeSupplier); summary = { total: Number(stats.total_suppliers || suppliers.length), payables: Number(stats.total_payables || 0), active: Number(stats.active_suppliers || 0) }; renderSuppliers(elements); await loadVisibleBalances(elements); } catch (error) { if (sequence === requestSequence) { suppliers = []; renderSuppliers(elements); showToast(elements, error.message, true); } }
}

function setView(elements, name) { elements.listView.hidden = name !== "list"; elements.detailView.hidden = name !== "detail"; elements.stateView.hidden = true; }
function openSupplierModal(elements, supplier = null) { elements.form.reset(); elements.nameError.hidden = true; elements.id.value = supplier?.id || ""; elements.name.value = supplier?.name || ""; elements.phone.value = supplier?.phone || ""; elements.address.value = supplier?.address || ""; elements.status.value = supplier?.status || "active"; elements.notes.value = supplier?.notes || ""; elements.modalTitle.textContent = supplier ? "تعديل بيانات المورد" : "إضافة مورد جديد"; elements.modal.hidden = false; }
function closeSupplierModal(elements) { elements.modal.hidden = true; }

function setupSupplierInvoicePagination(elements) {
  let page = 1;
  const render = () => {
    const rows = [...elements.invoicesBody.querySelectorAll(".purchase-invoice-row")];
    const pageCount = Math.max(1, Math.ceil(rows.length / INVOICE_PAGE_SIZE));
    page = Math.min(page, pageCount);
    rows.forEach((row, index) => { row.hidden = index < (page - 1) * INVOICE_PAGE_SIZE || index >= page * INVOICE_PAGE_SIZE; });
    elements.invoicesPagination.hidden = rows.length <= INVOICE_PAGE_SIZE;
    elements.invoicesPaginationInfo.textContent = rows.length ? `عرض ${(page - 1) * INVOICE_PAGE_SIZE + 1} إلى ${Math.min(page * INVOICE_PAGE_SIZE, rows.length)} من ${rows.length} فاتورة` : "";
    elements.invoicesPaginationPages.innerHTML = `<button class="page-btn" type="button" data-invoice-page="${page - 1}" ${page === 1 ? "disabled" : ""}>›</button><button class="page-btn is-active" type="button">${page}</button><button class="page-btn" type="button" data-invoice-page="${page + 1}" ${page === pageCount ? "disabled" : ""}>‹</button>`;
  };
  const observer = new MutationObserver(() => { page = 1; render(); });
  observer.observe(elements.invoicesBody, { childList: true });
  elements.invoicesPaginationPages.addEventListener("click", event => { const button = event.target.closest("[data-invoice-page]"); if (!button || button.disabled) return; page = Number(button.dataset.invoicePage); render(); });
  return () => observer.disconnect();
}

async function saveSupplier(elements) {
  const name = elements.name.value.trim(), phone = elements.phone.value.trim(); if (!name) { elements.nameError.hidden = false; elements.name.focus(); return; } if (!phone) { showToast(elements, "رقم الهاتف مطلوب.", true); elements.phone.focus(); return; }
  const payload = { name, phone, address: elements.address.value.trim() || null, notes: elements.notes.value.trim() || null, status: elements.status.value }; const id = elements.id.value;
  try { if (id) { const supplier = suppliers.find(item => String(item.id) === id); await api.patch(`/api/v1/admin/suppliers/${encodeURIComponent(id)}`, { ...payload, version: supplier?.version || 1 }); } else await api.post("/api/v1/admin/suppliers", payload); closeSupplierModal(elements); showToast(elements, id ? "تم تحديث المورد" : "تمت إضافة المورد"); await loadSuppliers(elements); } catch (error) { showToast(elements, error.message, true); }
}

async function showSupplierDetailLegacy(elements, supplier) {
  activeSupplier = supplier; elements.invoicesBody.innerHTML = '<tr><td colspan="9">جاري تحميل الفواتير...</td></tr>'; setView(elements, "detail");
  try { const [detailResponse, invoices] = await Promise.all([api.get(`/api/v1/admin/suppliers/${encodeURIComponent(supplier.id)}`), fetchAll(`/api/v1/admin/suppliers/${encodeURIComponent(supplier.id)}/purchase-invoices`)]), detail = normalizeSupplier(detailResponse?.supplier || detailResponse?.data || detailResponse); activeSupplier = detail; const index = suppliers.findIndex(item => String(item.id) === String(detail.id)); if (index >= 0) suppliers[index] = detail; elements.detailName.textContent = detail.name; elements.detailType.textContent = `${detail.phone} · ${detail.address || "لا يوجد عنوان"}`; elements.detailStatus.className = `suppliers-status suppliers-status--${detail.status}`; elements.detailStatus.textContent = detail.status === "active" ? "مورد نشط" : "مورد غير نشط"; elements.detailId.textContent = detail.id; elements.detailDate.textContent = dateLabel(detail.createdAt); elements.detailNotes.textContent = detail.notes || "لا توجد ملاحظات"; const total = invoices.reduce((sum, invoice) => sum + amount(invoice, "total_amount", "grand_total", "total"), 0), paid = invoices.reduce((sum, invoice) => sum + amount(invoice, "paid_amount", "total_paid"), 0), remaining = invoices.reduce((sum, invoice) => sum + amount(invoice, "remaining_amount", "balance_due"), 0); elements.detailTotal.textContent = `EGP ${money(detail.totalPurchases || total)}`; elements.detailPaid.textContent = `EGP ${money(detail.totalPaid || paid)}`; elements.detailBalance.textContent = `EGP ${money(detail.balanceDue || remaining)}`; supplierBalances.set(String(detail.id), { paid: detail.totalPaid || paid, remaining: detail.balanceDue || remaining }); elements.invoicesBody.innerHTML = invoices.map(invoice => `<tr class="purchase-invoice-row" data-invoice-id="${escapeHtml(String(invoice.id))}" tabindex="0"><td><b class="num">${escapeHtml(invoice.invoice_number || "—")}</b></td><td class="num" dir="ltr">${escapeHtml(detail.phone)}</td><td>${dateLabel(invoice.invoice_date || invoice.created_at)}</td><td>${dateLabel(invoice.due_date)}</td><td class="num">${money(amount(invoice, "total_amount", "grand_total", "total"))}</td><td class="num supplier-paid">${money(amount(invoice, "paid_amount", "total_paid"))}</td><td class="num supplier-balance">${money(amount(invoice, "remaining_amount", "balance_due"))}</td><td>${escapeHtml(PAYMENT_LABELS[invoice.payment_method] || invoice.payment_method || "—")}</td><td>${statusMarkup(invoice)}</td></tr>`).join("") || '<tr><td colspan="9">لا توجد فواتير شراء لهذا المورد</td></tr>'; } catch (error) { elements.invoicesBody.innerHTML = `<tr><td colspan="9">${escapeHtml(error.message)}</td></tr>`; }
}

async function showSupplierDetail(elements, supplier) {
  activeSupplier = supplier;
  setView(elements, "detail");
  elements.detailName.textContent = supplier.name;
  elements.detailType.textContent = `${supplier.phone} · ${supplier.address || "لا يوجد عنوان"}`;
  elements.detailStatus.className = `suppliers-status suppliers-status--${supplier.status}`;
  elements.detailStatus.textContent = supplier.status === "active" ? "مورد نشط" : "مورد غير نشط";
  elements.detailId.textContent = supplier.id;
  elements.detailDate.textContent = dateLabel(supplier.createdAt);
  elements.detailNotes.textContent = supplier.notes || "لا توجد ملاحظات";
  elements.invoicesBody.innerHTML = '<tr><td colspan="9">جاري تحميل الفواتير...</td></tr>';
  try {
    const invoices = await fetchAll(`/api/v1/admin/suppliers/${encodeURIComponent(supplier.id)}/purchase-invoices`);
    invoices.forEach(invoice => supplierInvoicesById.set(String(invoice.id), invoice));
    const total = invoices.reduce((sum, invoice) => sum + amount(invoice, "total_amount", "grand_total", "total"), 0);
    const paid = invoices.reduce((sum, invoice) => sum + amount(invoice, "paid_amount", "total_paid"), 0);
    const remaining = invoices.reduce((sum, invoice) => sum + amount(invoice, "remaining_amount", "balance_due"), 0);
    elements.detailTotal.textContent = `EGP ${money(supplier.totalPurchases || total)}`;
    elements.detailPaid.textContent = `EGP ${money(supplier.totalPaid || paid)}`;
    elements.detailBalance.textContent = `EGP ${money(supplier.balanceDue || remaining)}`;
    supplierBalances.set(String(supplier.id), { paid: supplier.totalPaid || paid, remaining: supplier.balanceDue || remaining });
    elements.invoicesBody.innerHTML = invoices.map(invoice => `<tr class="purchase-invoice-row" data-invoice-id="${escapeHtml(String(invoice.id))}" tabindex="0"><td><b class="num">${escapeHtml(invoice.invoice_number || "—")}</b></td><td class="num" dir="ltr">${escapeHtml(supplier.phone)}</td><td>${dateLabel(invoice.invoice_date || invoice.created_at)}</td><td>${dateLabel(invoice.due_date)}</td><td class="num">${money(amount(invoice, "total_amount", "grand_total", "total"))}</td><td class="num supplier-paid">${money(amount(invoice, "paid_amount", "total_paid"))}</td><td class="num supplier-balance">${money(amount(invoice, "remaining_amount", "balance_due"))}</td><td>${escapeHtml(PAYMENT_LABELS[invoice.payment_method] || invoice.payment_method || "—")}</td><td>${statusMarkup(invoice)}</td></tr>`).join("") || '<tr><td colspan="9">لا توجد فواتير شراء لهذا المورد</td></tr>';
  } catch (error) {
    elements.invoicesBody.innerHTML = '<tr><td colspan="9">تعذر تحميل فواتير المورد. حاول مرة أخرى.</td></tr>';
    showToast(elements, error.message, true);
  }
}

async function showPurchaseDetailLegacy(elements, invoiceId) {
  elements.purchaseDetailModal.hidden = false; elements.purchaseDetailModal.dataset.invoiceId = invoiceId; elements.purchaseDetailMeta.textContent = "جاري تحميل الفاتورة..."; elements.purchaseDetailSummary.innerHTML = ""; elements.purchaseDetailItems.innerHTML = '<tr><td colspan="9">جاري التحميل...</td></tr>'; elements.paymentsBody.innerHTML = '<tr><td colspan="4">جاري تحميل الدفعات...</td></tr>'; elements.paymentForm.hidden = true;
  try { const [invoiceResponse, paymentsResponse] = await Promise.all([api.get(`/api/v1/admin/purchase-invoices/${encodeURIComponent(invoiceId)}`), api.get(`/api/v1/admin/purchase-invoices/${encodeURIComponent(invoiceId)}/payments`, { query: { page: 1, page_size: 100 } })]); const invoice = invoiceResponse?.invoice || invoiceResponse?.data || invoiceResponse, items = invoice.purchase_invoice_items || invoice.items || [], payments = listFrom(paymentsResponse), remaining = amount(invoice, "remaining_amount", "balance_due"); elements.purchaseDetailModal.dataset.invoiceVersion = String(invoice.version || 1); elements.purchaseDetailMeta.textContent = `${invoice.invoice_number || "—"} · ${activeSupplier?.name || invoice.supplier_name || "—"} · ${activeSupplier?.phone || invoice.supplier_phone || "—"}`; elements.purchaseDetailSummary.innerHTML = `<span>تاريخ الفاتورة <b>${dateLabel(invoice.invoice_date || invoice.created_at)}</b></span><span>تاريخ الاستحقاق <b>${dateLabel(invoice.due_date)}</b></span><span>طريقة الدفع <b>${escapeHtml(PAYMENT_LABELS[invoice.payment_method] || invoice.payment_method || "—")}</b></span><span>الحالة <b>${statusMarkup(invoice)}</b></span><span>الإجمالي <b class="num">${money(amount(invoice, "total_amount", "grand_total", "total"))}</b></span><span>المدفوع <b class="num supplier-paid">${money(amount(invoice, "paid_amount", "total_paid"))}</b></span><span>المتبقي <b class="num supplier-balance">${money(remaining)}</b></span><span>الخصم / الشحن <b class="num">${money(amount(invoice, "discount_amount"))} / ${money(amount(invoice, "shipping_amount"))}</b></span>`; elements.purchaseDetailItems.innerHTML = items.map(item => { const variant = item.product_variant || item.product_variants || item.variant || {}, product = variant.product || variant.products || item.product || {}; return `<tr><td>${escapeHtml(product.name_ar || product.name || item.product_name || "—")}</td><td>${escapeHtml(product.category?.name || item.category_name || "—")}</td><td>${escapeHtml(variant.size || item.size || "—")}</td><td>${escapeHtml(variant.color || item.color || "—")}</td><td><span class="num" dir="ltr">${escapeHtml(variant.sku || item.sku || "—")}</span><small class="num" dir="ltr">${escapeHtml(variant.barcode || item.barcode || "—")}</small></td><td class="num">${Number(item.quantity || 0).toLocaleString("en-US")}</td><td class="num">${money(amount(item, "unit_cost", "unit_price"))}</td><td class="num">${money(amount(item, "discount_amount"))}</td><td class="num">${money(amount(item, "line_total", "total"))}</td></tr>`; }).join("") || '<tr><td colspan="9">لا توجد بنود</td></tr>'; elements.paymentsBody.innerHTML = payments.map(payment => `<tr><td>${dateLabel(payment.paid_at || payment.created_at)}</td><td class="num supplier-paid">${money(payment.amount)}</td><td>${escapeHtml(PAYMENT_LABELS[payment.method] || payment.method || "—")}</td><td>${escapeHtml(payment.reference || "—")}</td></tr>`).join("") || '<tr><td colspan="4">لم تُسجل دفعات على هذه الفاتورة</td></tr>'; elements.paymentBalance.textContent = `المتبقي: ${money(remaining)} EGP`; elements.paymentAmount.max = String(remaining); elements.paymentAmount.value = ""; elements.paymentReference.value = ""; elements.paymentForm.hidden = remaining <= 0 || ["void", "voided", "cancelled", "draft"].includes(String(invoice.status).toLowerCase()); elements.purchaseDetailNotes.textContent = invoice.notes || "لا توجد ملاحظات"; } catch (error) { elements.purchaseDetailMeta.textContent = error.message; elements.purchaseDetailItems.innerHTML = '<tr><td colspan="9">تعذّر تحميل التفاصيل</td></tr>'; elements.paymentsBody.innerHTML = '<tr><td colspan="4">تعذّر تحميل الدفعات</td></tr>'; }
}

function renderPurchaseInvoice(elements, invoice) {
  const items = invoice.purchase_invoice_items || invoice.items || [];
  const remaining = amount(invoice, "remaining_amount", "balance_due");
  elements.purchaseDetailModal.dataset.invoiceVersion = String(invoice.version || 1);
  elements.purchaseDetailMeta.textContent = `${invoice.invoice_number || "—"} · ${activeSupplier?.name || invoice.supplier_name || "—"} · ${activeSupplier?.phone || invoice.supplier_phone || "—"}`;
  elements.purchaseDetailSummary.innerHTML = `<span>تاريخ الفاتورة <b>${dateLabel(invoice.invoice_date || invoice.created_at)}</b></span><span>تاريخ الاستحقاق <b>${dateLabel(invoice.due_date)}</b></span><span>طريقة الدفع <b>${escapeHtml(PAYMENT_LABELS[invoice.payment_method] || invoice.payment_method || "—")}</b></span><span>الحالة <b>${statusMarkup(invoice)}</b></span><span>الإجمالي <b class="num">${money(amount(invoice, "total_amount", "grand_total", "total"))}</b></span><span>المدفوع <b class="num supplier-paid">${money(amount(invoice, "paid_amount", "total_paid"))}</b></span><span>المتبقي <b class="num supplier-balance">${money(remaining)}</b></span><span>الخصم / الشحن <b class="num">${money(amount(invoice, "discount_amount"))} / ${money(amount(invoice, "shipping_amount"))}</b></span>`;
  elements.purchaseDetailItems.innerHTML = items.map(item => {
    const variant = item.product_variant || item.product_variants || item.variant || {};
    const product = variant.product || variant.products || item.product || {};
    const name = product.name_ar || product.name || item.product_name || "منتج بدون اسم من الخادم";
    const sku = variant.sku || item.sku || item.variant_id || item.product_variant_id || "—";
    return `<tr><td><strong>${escapeHtml(name)}</strong></td><td>${escapeHtml(product.category?.name || item.category_name || "—")}</td><td>${escapeHtml(variant.size || item.size || "—")}</td><td>${escapeHtml(variant.color || item.color || "—")}</td><td><span class="num" dir="ltr">${escapeHtml(sku)}</span><small class="num" dir="ltr">${escapeHtml(variant.barcode || item.barcode || "—")}</small></td><td class="num">${Number(item.quantity || 0).toLocaleString("en-US")}</td><td class="num">${money(amount(item, "unit_cost", "unit_price"))}</td><td class="num">${money(amount(item, "discount_amount"))}</td><td class="num">${money(amount(item, "line_total", "total"))}</td></tr>`;
  }).join("") || '<tr><td colspan="9">لا توجد منتجات مسجلة في استجابة الفاتورة</td></tr>';
  elements.paymentBalance.textContent = `المتبقي: ${money(remaining)} EGP`;
  setPaymentFormState(elements, invoice);
  elements.purchaseDetailNotes.textContent = invoice.notes || "لا توجد ملاحظات";
}

async function showPurchaseDetail(elements, invoiceId) {
  elements.purchaseDetailModal.hidden = false;
  elements.purchaseDetailModal.dataset.invoiceId = invoiceId;
  elements.paymentsBody.innerHTML = '<tr><td colspan="4">جاري تحميل الدفعات...</td></tr>';
  const cachedInvoice = supplierInvoicesById.get(String(invoiceId));
  if (cachedInvoice) renderPurchaseInvoice(elements, cachedInvoice);
  else {
    elements.purchaseDetailMeta.textContent = "جاري تحميل الفاتورة...";
    elements.purchaseDetailItems.innerHTML = '<tr><td colspan="9">جاري تحميل المنتجات...</td></tr>';
  }
  try {
    const response = await api.get(`/api/v1/admin/purchase-invoices/${encodeURIComponent(invoiceId)}`);
    const invoice = response?.invoice || response?.item || response?.data || response;
    supplierInvoicesById.set(String(invoiceId), invoice);
    renderPurchaseInvoice(elements, invoice);
  } catch (error) {
    if (!cachedInvoice) elements.purchaseDetailItems.innerHTML = '<tr><td colspan="9">تعذر تحميل بيانات الفاتورة</td></tr>';
    showToast(elements, error.message, true);
  }
  await loadInvoicePayments(elements, invoiceId);
}

function paymentRowMarkup(payment) {
  return `<tr><td>${dateLabel(payment.paid_at || payment.payment_date || payment.created_at)}</td><td class="num supplier-paid">${money(payment.amount || payment.paid_amount)}</td><td>${escapeHtml(PAYMENT_LABELS[payment.method || payment.payment_method] || payment.method || payment.payment_method || "—")}</td><td>${escapeHtml(payment.reference || payment.payment_reference || "—")}</td></tr>`;
}

async function loadInvoicePayments(elements, invoiceId, { preserveOnError = false } = {}) {
  try {
    const response = await api.get(`/api/v1/admin/purchase-invoices/${encodeURIComponent(invoiceId)}/payments`, { query: { page: 1, page_size: 100 } });
    const payments = listFrom(response);
    elements.paymentsBody.innerHTML = payments.map(paymentRowMarkup).join("") || '<tr><td colspan="4">لم تُسجل دفعات على هذه الفاتورة</td></tr>';
    return true;
  } catch {
    if (!preserveOnError) elements.paymentsBody.innerHTML = '<tr><td colspan="4">سجل الدفعات غير متاح حاليًا</td></tr>';
    return false;
  }
}

function setPaymentFormState(elements, invoice) {
  const remaining = amount(invoice, "remaining_amount", "balance_due");
  const status = String(invoice.status || "").toLowerCase();
  const unavailable = ["void", "voided", "cancelled", "draft"].includes(status);
  const paid = remaining <= 0;
  elements.paymentForm.hidden = unavailable;
  elements.paymentAmount.max = String(Math.max(0, remaining));
  elements.paymentAmount.value = "";
  elements.paymentAmount.readOnly = paid;
  elements.paymentAmount.placeholder = paid ? "الفاتورة مسددة بالكامل" : "أدخل قيمة الدفعة";
  elements.paymentDetailMethod.disabled = paid;
  elements.paymentReference.disabled = paid;
  elements.savePayment.disabled = paid;
  elements.paymentNotice.hidden = !paid;
  elements.paymentNotice.textContent = paid ? "الفاتورة مسددة بالكامل، لا يوجد عليك أي مبلغ مستحق." : "";
}

async function saveInvoicePayment(elements) {
  const invoiceId = elements.purchaseDetailModal.dataset.invoiceId, expectedVersion = Number(elements.purchaseDetailModal.dataset.invoiceVersion), amountValue = Number(elements.paymentAmount.value), maximum = Number(elements.paymentAmount.max);
  if (maximum <= 0) { showToast(elements, "الفاتورة مسددة بالكامل، لا يوجد عليك أي مبلغ مستحق.", true); return; }
  if (!amountValue || amountValue <= 0) { showToast(elements, "أدخل قيمة دفعة أكبر من صفر.", true); return; }
  if (amountValue > maximum) { showToast(elements, "قيمة الدفعة لا يمكن أن تتجاوز المبلغ المتبقي.", true); return; }
  const paidAt = new Date().toISOString(), payload = { expected_version: expectedVersion, amount: amountValue, method: elements.paymentDetailMethod.value, reference: elements.paymentReference.value.trim() || null, paid_at: paidAt };
  elements.savePayment.disabled = true;
  try {
    const response = await api.post(`/api/v1/admin/purchase-invoices/${encodeURIComponent(invoiceId)}/payments`, payload, { headers: { "Idempotency-Key": crypto.randomUUID() } });
    const returnedPayment = response?.payment || response?.data?.payment || (response?.amount ? response : null) || {};
    const loadedFromApi = await loadInvoicePayments(elements, invoiceId, { preserveOnError: true });
    if (!loadedFromApi) {
      elements.paymentsBody.querySelector('td[colspan="4"]')?.closest("tr")?.remove();
      elements.paymentsBody.insertAdjacentHTML("afterbegin", paymentRowMarkup({ ...payload, ...returnedPayment }));
    }
    const cached = supplierInvoicesById.get(String(invoiceId)), returnedInvoice = response?.invoice || response?.data?.invoice;
    const updatedInvoice = returnedInvoice || (cached ? { ...cached, paid_amount: amount(cached, "paid_amount", "total_paid") + amountValue, remaining_amount: Math.max(0, amount(cached, "remaining_amount", "balance_due") - amountValue), payment_status: maximum - amountValue <= 0 ? "paid" : "partial", version: Number(response?.version || cached.version || expectedVersion) + (response?.version ? 0 : 1) } : null);
    if (updatedInvoice) { supplierInvoicesById.set(String(invoiceId), updatedInvoice); renderPurchaseInvoice(elements, updatedInvoice); }
    supplierBalances.delete(String(activeSupplier.id));
    elements.paymentAmount.value = ""; elements.paymentReference.value = "";
    showToast(elements, "تم تسجيل الدفعة وظهرت في سجل الفاتورة.");
  } catch (error) { showToast(elements, error.message, true); }
  finally { elements.savePayment.disabled = Number(elements.paymentAmount.max) <= 0; }
}

async function saveInvoicePaymentLegacy(elements) {
  const invoiceId = elements.purchaseDetailModal.dataset.invoiceId, expectedVersion = Number(elements.purchaseDetailModal.dataset.invoiceVersion), amountValue = Number(elements.paymentAmount.value), maximum = Number(elements.paymentAmount.max);
  if (!amountValue || amountValue <= 0) { showToast(elements, "أدخل قيمة دفعة أكبر من صفر.", true); return; }
  if (amountValue > maximum) { showToast(elements, "قيمة الدفعة لا يمكن أن تتجاوز المبلغ المتبقي.", true); return; }
  elements.savePayment.disabled = true;
  try { await api.post(`/api/v1/admin/purchase-invoices/${encodeURIComponent(invoiceId)}/payments`, { expected_version: expectedVersion, amount: amountValue, method: elements.paymentDetailMethod.value, reference: elements.paymentReference.value.trim() || null, paid_at: new Date().toISOString() }, { headers: { "Idempotency-Key": crypto.randomUUID() } }); supplierBalances.delete(String(activeSupplier.id)); showToast(elements, "تم تسجيل الدفعة وتحديث رصيد الفاتورة."); await showPurchaseDetail(elements, invoiceId); await showSupplierDetail(elements, activeSupplier); }
  catch (error) { showToast(elements, error.message, true); }
  finally { elements.savePayment.disabled = false; }
}

function confirmDeactivation(elements, supplier) { elements.deactivateName.textContent = supplier.name; elements.deactivateModal.hidden = false; return new Promise(resolve => { const finish = value => { elements.deactivateModal.hidden = true; document.getElementById("confirmSupplierDeactivate").removeEventListener("click", yes); document.getElementById("cancelSupplierDeactivate").removeEventListener("click", no); resolve(value); }; const yes = () => finish(true), no = () => finish(false); document.getElementById("confirmSupplierDeactivate").addEventListener("click", yes); document.getElementById("cancelSupplierDeactivate").addEventListener("click", no); }); }

async function loadProductOptions() { if (products.length) return; products = (await fetchAll("/api/v1/admin/products", { status: "active" })).map(item => ({ id: item.id, name: item.name_ar || item.name, price: Number(item.purchase_price || 0) })); }
function addPurchaseLine(elements) { const row = document.createElement("div"); row.className = "purchase-line"; row.innerHTML = `<select class="select purchase-product" aria-label="المنتج"><option value="">اختر المنتج...</option>${products.map(product => `<option value="${escapeHtml(String(product.id))}" data-price="${product.price}">${escapeHtml(product.name)}</option>`).join("")}</select><select class="select purchase-variant" aria-label="نسخة المنتج" disabled><option value="">اختر المنتج أولًا</option></select><input class="input num purchase-qty" type="number" min="1" value="1" aria-label="الكمية"><input class="input num purchase-price" type="number" min="0" step="0.01" value="0" aria-label="سعر الوحدة"><button class="suppliers-action suppliers-action--delete purchase-remove" type="button" aria-label="حذف البند">×</button>`; elements.purchaseLines.append(row); }
function variantLabel(variant) {
  const attributes = [variant.color, variant.size, variant.sku].filter(Boolean);
  return attributes.length ? attributes.join(" · ") : `نسخة ${variant.id}`;
}
async function loadLineVariants(row, productId) {
  const select = row.querySelector(".purchase-variant");
  select.disabled = true;
  select.innerHTML = '<option value="">جاري تحميل النسخ...</option>';
  if (!productId) { select.innerHTML = '<option value="">اختر المنتج أولًا</option>'; return; }
  try {
    const detail = await api.get(`/api/v1/products/${encodeURIComponent(productId)}`);
    const variants = detail.product_variants || detail.variants || [];
    select.innerHTML = `<option value="">اختر النسخة...</option>${variants.map(variant => `<option value="${escapeHtml(String(variant.id))}" data-version="${escapeHtml(String(variant.version ?? ""))}">${escapeHtml(variantLabel(variant))}</option>`).join("")}`;
    select.disabled = variants.length === 0;
    if (!variants.length) select.innerHTML = '<option value="">لا توجد نسخ متاحة</option>';
  } catch (error) {
    select.innerHTML = '<option value="">تعذّر تحميل النسخ</option>';
    throw error;
  }
}
async function openPurchase(elements) {
  if (!activeSupplier) return;
  try {
    await loadProductOptions();
    elements.purchaseForm.reset();
    elements.purchaseLines.innerHTML = "";
    document.getElementById("purchaseSupplierName").textContent = activeSupplier.name;
    elements.dueDateField.hidden = true;
    elements.dueDate.min = new Date().toISOString().slice(0, 10);
    addPurchaseLine(elements);
    elements.purchaseModal.hidden = false;
  } catch (error) { showToast(elements, error.message, true); }
}
function closePurchase(elements) { elements.purchaseModal.hidden = true; }

async function savePurchase(elements) {
  const rows = [...elements.purchaseLines.querySelectorAll(".purchase-line")]; const items = [];
  try { for (const row of rows) { const productId = row.querySelector(".purchase-product").value; if (!productId) throw new Error("اختر منتجًا لكل بند."); const variantSelect = row.querySelector(".purchase-variant"); const variantId = variantSelect.value; const variantVersion = variantSelect.selectedOptions[0]?.dataset.version; if (!variantId) throw new Error("اختر اللون أو المقاس الصحيح لكل منتج."); if (!variantVersion) throw new Error("بيانات نسخة المنتج غير مكتملة. أعد اختيار المنتج وحاول مرة أخرى."); items.push({ variant_id: variantId, quantity: Math.max(1, Number(row.querySelector(".purchase-qty").value) || 1), unit_price: Math.max(0, Number(row.querySelector(".purchase-price").value) || 0), expected_version: Number(variantVersion) }); }
    const deferred = elements.paymentMethod.value === "deferred", total = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0), paid = Math.max(0, Number(elements.paidAmount.value) || 0); if (paid > total) throw new Error("المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة."); if (deferred && !elements.dueDate.value) throw new Error("حدد تاريخ الاستحقاق للفاتورة الآجلة."); elements.savePurchase.disabled = true; await api.post(`/api/v1/admin/suppliers/${encodeURIComponent(activeSupplier.id)}/purchase-invoices`, { payment_method: elements.paymentMethod.value, paid_amount: paid, due_date: deferred ? elements.dueDate.value : null, notes: elements.purchaseNotes.value.trim() || null, items }, { headers: { "Idempotency-Key": crypto.randomUUID() } }); supplierBalances.delete(String(activeSupplier.id)); closePurchase(elements); showToast(elements, "تمت إضافة فاتورة الشراء"); await showSupplierDetail(elements, activeSupplier); } catch (error) { showToast(elements, error.message, true); } finally { elements.savePurchase.disabled = false; }
}

export function initSuppliers() {
  const elements = getElements(); const stopInvoicePagination = setupSupplierInvoicePagination(elements); window.bindAdminThemeToggle?.(document.getElementById("suppliersThemeToggle")); setView(elements, "list"); loadSuppliers(elements);
  const successMessage = sessionStorage.getItem("ghaith-suppliers-success");
  if (successMessage) { sessionStorage.removeItem("ghaith-suppliers-success"); showToast(elements, successMessage); }
  const refresh = debounce(() => { currentPage = 1; loadSuppliers(elements); }, 300);
  const openSupplierFromRow = event => {
    if (event.target.closest('[data-action]:not([data-action="view"])')) return;
    const row = event.target.closest("[data-supplier-id]");
    if (!row) return;
    const supplier = suppliers.find(item => String(item.id) === row.dataset.supplierId);
    if (!supplier) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showSupplierDetail(elements, supplier);
  };
  elements.tableBody.addEventListener("click", openSupplierFromRow, true);
  const toggleStatus = async event => {
    const button = event.target.closest('[data-action="toggle-status"]');
    const row = button?.closest("[data-supplier-id]");
    if (!button || !row) return;
    const supplier = suppliers.find(item => String(item.id) === row.dataset.supplierId);
    if (!supplier) return;
    button.disabled = true;
    const status = supplier.status === "active" ? "inactive" : "active";
    try { await api.patch(`/api/v1/admin/suppliers/${encodeURIComponent(supplier.id)}`, { status, version: supplier.version }); showToast(elements, status === "active" ? "تم تفعيل المورد" : "تم إيقاف المورد"); await loadSuppliers(elements); }
    catch (error) { button.disabled = false; showToast(elements, error.message, true); }
  };
  const tableClick = async event => { const action = event.target.closest("[data-action]"), row = action?.closest("[data-supplier-id]"); if (!action || !row) return; const supplier = suppliers.find(item => String(item.id) === row.dataset.supplierId); if (!supplier) return; if (action.dataset.action === "view") await showSupplierDetail(elements, supplier); if (action.dataset.action === "edit") openSupplierModal(elements, supplier); if (action.dataset.action === "deactivate" && supplier.status === "active" && await confirmDeactivation(elements, supplier)) { try { await api.delete(`/api/v1/admin/suppliers/${encodeURIComponent(supplier.id)}`, { query: { version: supplier.version } }); supplierBalances.delete(String(supplier.id)); showToast(elements, "تمت أرشفة المورد"); await loadSuppliers(elements); } catch (error) { showToast(elements, error.message, true); } } };
  elements.tableBody.addEventListener("click", toggleStatus); elements.tableBody.addEventListener("click", tableClick); elements.form.addEventListener("submit", event => { event.preventDefault(); saveSupplier(elements); }); elements.pagination.addEventListener("click", event => { const button = event.target.closest("[data-page]"); if (!button || button.disabled) return; currentPage = Number(button.dataset.page); renderSuppliers(elements); loadVisibleBalances(elements); });
  elements.search.addEventListener("input", refresh); elements.statusFilter.addEventListener("change", refresh); document.getElementById("addSupplierBtn").addEventListener("click", () => openSupplierModal(elements)); document.getElementById("closeSupplierModal").addEventListener("click", () => closeSupplierModal(elements)); document.getElementById("cancelSupplierModal").addEventListener("click", () => closeSupplierModal(elements)); document.getElementById("backToSuppliers").addEventListener("click", () => setView(elements, "list")); document.getElementById("newSupplierPayment").addEventListener("click", () => openPurchase(elements));
  document.getElementById("addPurchaseLine").addEventListener("click", () => addPurchaseLine(elements)); elements.purchaseLines.addEventListener("change", async event => { if (!event.target.matches(".purchase-product")) return; const option = event.target.selectedOptions[0]; const row = event.target.closest(".purchase-line"); row.querySelector(".purchase-price").value = option?.dataset.price || 0; try { await loadLineVariants(row, event.target.value); } catch (error) { showToast(elements, error.message, true); } }); elements.purchaseLines.addEventListener("click", event => event.target.closest(".purchase-remove")?.closest(".purchase-line")?.remove()); elements.purchaseForm.addEventListener("submit", event => { event.preventDefault(); savePurchase(elements); }); document.getElementById("closePurchaseInvoice").addEventListener("click", () => closePurchase(elements)); document.getElementById("cancelPurchaseInvoice").addEventListener("click", () => closePurchase(elements)); elements.paymentMethod.addEventListener("change", () => { elements.dueDateField.hidden = elements.paymentMethod.value !== "deferred"; });
  elements.invoicesBody.addEventListener("click", event => { const row = event.target.closest("[data-invoice-id]"); if (row) showPurchaseDetail(elements, row.dataset.invoiceId); }); elements.invoicesBody.addEventListener("keydown", event => { const row = event.target.closest("[data-invoice-id]"); if (row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); showPurchaseDetail(elements, row.dataset.invoiceId); } }); elements.paymentForm.addEventListener("submit", event => { event.preventDefault(); saveInvoicePayment(elements); }); elements.paymentAmount.addEventListener("focus", () => { if (Number(elements.paymentAmount.max) <= 0) showToast(elements, "الفاتورة مسددة بالكامل، لا يوجد عليك أي مبلغ مستحق.", true); }); document.getElementById("closePurchaseDetail").addEventListener("click", () => { elements.purchaseDetailModal.hidden = true; });
  return () => { requestSequence += 1; refresh.cancel?.(); stopInvoicePagination(); elements.tableBody.removeEventListener("click", toggleStatus); elements.tableBody.removeEventListener("click", tableClick); };
}
