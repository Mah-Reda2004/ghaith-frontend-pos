import { api } from "../../../core/api.js";
import { debounce, escapeHtml } from "../../../core/utils.js";

const API_PAGE_SIZE = 100;
const UI_PAGE_SIZE = 20;
let suppliers = [];
let products = [];
let summary = { total: 0, payables: 0, active: 0 };
let currentPage = 1;
let activeSupplier = null;
let requestSequence = 0;
const supplierBalances = new Map();

function addApiUi() {
  if (document.getElementById("supplierAddress")) return;
  const phoneField = document.getElementById("supplierPhone").closest(".field");
  phoneField.insertAdjacentHTML("afterend", '<div class="field"><label for="supplierAddress">العنوان</label><input class="input" id="supplierAddress" type="text" placeholder="عنوان المورد"></div>');
  ["supplierType", "supplierPaymentType", "supplierPurchases", "supplierPaid"].forEach(id => { const field = document.getElementById(id)?.closest(".field"); if (field) field.hidden = true; });
  const status = document.getElementById("supplierStatus");
  status.innerHTML = '<option value="active">نشط</option><option value="inactive">غير نشط</option>';
  document.getElementById("suppliersStatusFilter").innerHTML = '<option value="all">جميع الحالات</option><option value="active">نشط</option><option value="inactive">غير نشط</option>';
  document.querySelector(".suppliers-phone span")?.remove();
  document.querySelector(".suppliers-table thead").innerHTML = "<tr><th>المعرّف</th><th>اسم المورد</th><th>رقم الهاتف</th><th>العنوان</th><th>الملاحظات</th><th>تاريخ الإضافة</th><th>النسخة</th><th>المبلغ المدفوع</th><th>المبلغ المتبقي</th><th>الحالة</th><th>الإجراءات</th></tr>";
  document.querySelector(".supplier-stat--purchases span").textContent = "إجمالي مستحقات الموردين";
  document.getElementById("newSupplierPayment").textContent = "+ فاتورة شراء جديدة";
  document.getElementById("addSupplierBtn").insertAdjacentHTML("beforebegin", '<button class="btn btn-outline" id="runSupplierReminders" type="button">تشغيل تذكيرات الاستحقاق</button>');
  const purchaseSection = document.querySelector(".supplier-purchases");
  purchaseSection.querySelector("h2").textContent = "فواتير الشراء";
  purchaseSection.querySelector("thead").innerHTML = "<tr><th>رقم الفاتورة</th><th>طريقة الدفع</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr>";
  purchaseSection.querySelector("tbody").id = "supplierInvoicesBody";
  purchaseSection.querySelector("tfoot")?.remove();
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
      <div class="suppliers-dialog__body"><div class="purchase-detail-summary" id="purchaseDetailSummary"></div><div class="table-responsive"><table class="data-table"><thead><tr><th>المنتج</th><th>الفئة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody id="purchaseDetailItems"></tbody></table></div><div class="supplier-detail__notes"><h2>ملاحظات الفاتورة</h2><p id="purchaseDetailNotes">—</p></div></div>
    </section></div>
    <div class="modal-overlay suppliers-modal" id="supplierDeactivateModal" hidden><section class="modal suppliers-confirm" role="alertdialog" aria-modal="true" aria-labelledby="supplierDeactivateTitle"><span class="suppliers-confirm__icon">!</span><h2 id="supplierDeactivateTitle">أرشفة المورد؟</h2><p>سيتم أرشفة <b id="supplierDeactivateName"></b> وإزالته من قائمة الموردين النشطين.</p><div><button class="btn btn-outline" id="cancelSupplierDeactivate" type="button">إلغاء</button><button class="btn suppliers-confirm__submit" id="confirmSupplierDeactivate" type="button">أرشفة المورد</button></div></section></div>`);
}

function getElements() {
  addApiUi();
  return {
    listView: document.getElementById("suppliersListView"), detailView: document.getElementById("supplierDetailView"), stateView: document.getElementById("suppliersViewState"),
    tableBody: document.getElementById("suppliersTableBody"), empty: document.getElementById("suppliersEmpty"), search: document.getElementById("suppliersSearch"), statusFilter: document.getElementById("suppliersStatusFilter"), paginationInfo: document.getElementById("suppliersPaginationInfo"), pagination: document.querySelector(".suppliers-pagination .pagination__pages"),
    totalStat: document.getElementById("suppliersTotalStat"), purchasesStat: document.getElementById("suppliersPurchasesStat"), activeStat: document.getElementById("suppliersActiveStat"),
    detailName: document.getElementById("supplierDetailName"), detailType: document.getElementById("supplierDetailType"), detailStatus: document.getElementById("supplierDetailStatus"), detailId: document.getElementById("supplierDetailId"), detailDate: document.getElementById("supplierDetailDate"), detailTotal: document.getElementById("detailTotal"), detailPaid: document.getElementById("detailPaid"), detailBalance: document.getElementById("detailBalance"), detailNotes: document.getElementById("supplierDetailNotes"), invoicesBody: document.getElementById("supplierInvoicesBody"),
    modal: document.getElementById("supplierModal"), modalTitle: document.getElementById("supplierModalTitle"), form: document.getElementById("supplierForm"), id: document.getElementById("supplierId"), name: document.getElementById("supplierName"), phone: document.getElementById("supplierPhone"), address: document.getElementById("supplierAddress"), status: document.getElementById("supplierStatus"), notes: document.getElementById("supplierNotes"), nameError: document.getElementById("supplierNameError"), toastStack: document.getElementById("suppliersToastStack"),
    purchaseModal: document.getElementById("purchaseInvoiceModal"), purchaseForm: document.getElementById("purchaseInvoiceForm"), paymentMethod: document.getElementById("purchasePaymentMethod"), paidAmount: document.getElementById("purchasePaidAmount"), dueDate: document.getElementById("purchaseDueDate"), dueDateField: document.getElementById("purchaseDueDateField"), purchaseNotes: document.getElementById("purchaseNotes"), purchaseLines: document.getElementById("purchaseLines"), savePurchase: document.getElementById("savePurchaseInvoice"),
    purchaseDetailModal: document.getElementById("purchaseDetailModal"), purchaseDetailMeta: document.getElementById("purchaseDetailMeta"), purchaseDetailSummary: document.getElementById("purchaseDetailSummary"), purchaseDetailItems: document.getElementById("purchaseDetailItems"), purchaseDetailNotes: document.getElementById("purchaseDetailNotes"), deactivateModal: document.getElementById("supplierDeactivateModal"), deactivateName: document.getElementById("supplierDeactivateName")
  };
}

const money = value => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const listFrom = response => Array.isArray(response) ? response : response?.items || [];
const dateLabel = value => value ? new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date(value)) : "—";
function showToast(elements, message, error = false) { const toast = document.createElement("div"); toast.className = `toast${error ? " is-error" : ""}`; toast.textContent = message; elements.toastStack.append(toast); setTimeout(() => toast.remove(), 3200); }

function normalizeSupplier(item) { return { id: item.id, name: item.name || "—", phone: item.phone || "—", address: item.address || "", notes: item.notes || "", status: item.status || "active", createdAt: item.created_at, version: Number(item.version || 1) }; }

function renderSummary(elements) {
  elements.totalStat.textContent = summary.total.toLocaleString("en-US"); elements.purchasesStat.textContent = money(summary.payables); elements.activeStat.textContent = summary.active.toLocaleString("en-US");
}

function renderSuppliers(elements) {
  const start = (currentPage - 1) * UI_PAGE_SIZE; const rows = suppliers.slice(start, start + UI_PAGE_SIZE);
  elements.tableBody.innerHTML = rows.map(supplier => { const balance = supplierBalances.get(String(supplier.id)); return `<tr data-supplier-id="${escapeHtml(String(supplier.id))}"><td class="num" dir="ltr">${escapeHtml(String(supplier.id))}</td><td><button class="supplier-name-button" type="button" data-action="view">${escapeHtml(supplier.name)}</button></td><td class="num" dir="ltr">${escapeHtml(supplier.phone)}</td><td>${escapeHtml(supplier.address || "—")}</td><td>${escapeHtml(supplier.notes || "—")}</td><td>${dateLabel(supplier.createdAt)}</td><td class="num">${supplier.version}</td><td class="num supplier-paid">${balance ? money(balance.paid) : "…"}</td><td class="num supplier-balance">${balance ? money(balance.remaining) : "…"}</td><td><button class="status-toggle status-toggle--table${supplier.status === "active" ? "" : " is-inactive"}" type="button" role="switch" aria-checked="${supplier.status === "active"}" data-action="toggle-status"><span class="status-toggle__label">${supplier.status === "active" ? "نشط" : "غير نشط"}</span><span class="status-toggle__track" aria-hidden="true"><span class="status-toggle__thumb"></span></span></button></td><td><div class="suppliers-actions"><button class="suppliers-action suppliers-action--edit" type="button" data-action="edit" aria-label="تعديل"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="suppliers-action suppliers-action--delete" type="button" data-action="deactivate" aria-label="أرشفة"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11h5"/></svg></button></div></td></tr>`; }).join("");
  elements.empty.hidden = rows.length > 0; elements.tableBody.hidden = rows.length === 0; elements.paginationInfo.textContent = rows.length ? `عرض ${start + 1} إلى ${start + rows.length} من ${suppliers.length} مورد` : "لا توجد نتائج مطابقة";
  const pagesCount = Math.max(1, Math.ceil(suppliers.length / UI_PAGE_SIZE)); currentPage = Math.min(currentPage, pagesCount); const pages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pagesCount])].filter(page => page > 0 && page <= pagesCount).sort((a,b) => a-b);
  elements.pagination.innerHTML = `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>›</button>${pages.map(page => `<button class="page-btn${page === currentPage ? " is-active" : ""}" data-page="${page}">${page}</button>`).join("")}<button class="page-btn" data-page="${currentPage + 1}" ${currentPage === pagesCount ? "disabled" : ""}>‹</button>`; renderSummary(elements);
}

async function fetchAll(path, query = {}) { const first = await api.get(path, { query: { ...query, page: 1, page_size: API_PAGE_SIZE } }); const count = Math.ceil(Number(first.total || listFrom(first).length) / API_PAGE_SIZE); const rest = count > 1 ? await Promise.all(Array.from({ length: count - 1 }, (_, i) => api.get(path, { query: { ...query, page: i + 2, page_size: API_PAGE_SIZE } }))) : []; return [first, ...rest].flatMap(listFrom); }

async function loadVisibleBalances(elements) {
  const start = (currentPage - 1) * UI_PAGE_SIZE;
  const visible = suppliers.slice(start, start + UI_PAGE_SIZE).filter(supplier => !supplierBalances.has(String(supplier.id)));
  if (!visible.length) return;
  await Promise.all(visible.map(async supplier => {
    try { const invoices = await fetchAll(`/api/v1/admin/suppliers/${encodeURIComponent(supplier.id)}/purchase-invoices`); supplierBalances.set(String(supplier.id), { paid: invoices.reduce((sum, invoice) => sum + Number(invoice.paid_amount || 0), 0), remaining: invoices.reduce((sum, invoice) => sum + Number(invoice.remaining_amount || 0), 0) }); }
    catch { supplierBalances.set(String(supplier.id), { paid: 0, remaining: 0 }); }
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

async function saveSupplier(elements) {
  const name = elements.name.value.trim(), phone = elements.phone.value.trim(); if (!name) { elements.nameError.hidden = false; elements.name.focus(); return; } if (!phone) { showToast(elements, "رقم الهاتف مطلوب.", true); elements.phone.focus(); return; }
  const payload = { name, phone, address: elements.address.value.trim() || null, notes: elements.notes.value.trim() || null, status: elements.status.value }; const id = elements.id.value;
  try { if (id) { const supplier = suppliers.find(item => String(item.id) === id); await api.patch(`/api/v1/admin/suppliers/${encodeURIComponent(id)}`, { ...payload, version: supplier?.version || 1 }); } else await api.post("/api/v1/admin/suppliers", payload); closeSupplierModal(elements); showToast(elements, id ? "تم تحديث المورد" : "تمت إضافة المورد"); await loadSuppliers(elements); } catch (error) { showToast(elements, error.message, true); }
}

async function showSupplierDetail(elements, supplier) {
  activeSupplier = supplier; elements.invoicesBody.innerHTML = '<tr><td colspan="6">جاري تحميل الفواتير...</td></tr>'; setView(elements, "detail");
  try { const [detailResponse, invoices] = await Promise.all([api.get(`/api/v1/admin/suppliers/${encodeURIComponent(supplier.id)}`), fetchAll(`/api/v1/admin/suppliers/${encodeURIComponent(supplier.id)}/purchase-invoices`)]), detail = normalizeSupplier(detailResponse?.supplier || detailResponse?.data || detailResponse); activeSupplier = detail; const index = suppliers.findIndex(item => String(item.id) === String(detail.id)); if (index >= 0) suppliers[index] = detail; elements.detailName.textContent = detail.name; elements.detailType.textContent = detail.address || "لا يوجد عنوان"; elements.detailStatus.className = `suppliers-status suppliers-status--${detail.status}`; elements.detailStatus.textContent = detail.status === "active" ? "مورد نشط" : "مورد غير نشط"; elements.detailId.textContent = detail.id; elements.detailDate.textContent = dateLabel(detail.createdAt); elements.detailNotes.textContent = detail.notes || "لا توجد ملاحظات"; const total = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0), paid = invoices.reduce((sum, invoice) => sum + Number(invoice.paid_amount || 0), 0); elements.detailTotal.textContent = `EGP ${money(total)}`; elements.detailPaid.textContent = `EGP ${money(paid)}`; elements.detailBalance.textContent = `EGP ${money(total - paid)}`; elements.invoicesBody.innerHTML = invoices.map(invoice => `<tr class="purchase-invoice-row" data-invoice-id="${escapeHtml(String(invoice.id))}" tabindex="0"><td>${escapeHtml(invoice.invoice_number || "—")}</td><td>${invoice.payment_method === "cash" ? "نقدي" : "آجل"}</td><td class="num">${money(invoice.total_amount)}</td><td class="num supplier-paid">${money(invoice.paid_amount)}</td><td class="num supplier-balance">${money(invoice.remaining_amount)}</td><td>${escapeHtml(invoice.status)}</td></tr>`).join("") || '<tr><td colspan="6">لا توجد فواتير شراء</td></tr>'; } catch (error) { elements.invoicesBody.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`; }
}

async function showPurchaseDetail(elements, invoiceId) {
  elements.purchaseDetailModal.hidden = false; elements.purchaseDetailMeta.textContent = "جاري تحميل الفاتورة..."; elements.purchaseDetailSummary.innerHTML = ""; elements.purchaseDetailItems.innerHTML = '<tr><td colspan="5">جاري التحميل...</td></tr>';
  try { const invoice = await api.get(`/api/v1/admin/purchase-invoices/${encodeURIComponent(invoiceId)}`); const items = invoice.purchase_invoice_items || invoice.items || []; elements.purchaseDetailMeta.textContent = `${invoice.invoice_number || "—"} · ${dateLabel(invoice.created_at)}`; elements.purchaseDetailSummary.innerHTML = `<span>طريقة الدفع <b>${invoice.payment_method === "cash" ? "نقدي" : "آجل"}</b></span><span>الإجمالي <b class="num">${money(invoice.total_amount)}</b></span><span>المدفوع <b class="num">${money(invoice.paid_amount)}</b></span><span>المتبقي <b class="num">${money(invoice.remaining_amount)}</b></span>`; elements.purchaseDetailItems.innerHTML = items.map(item => `<tr><td>${escapeHtml(item.product_variants?.products?.name || item.product_name || "—")}</td><td>${escapeHtml(item.category_name || "—")}</td><td class="num">${money(item.quantity)}</td><td class="num">${money(item.unit_price)}</td><td class="num">${money(item.line_total)}</td></tr>`).join("") || '<tr><td colspan="5">لا توجد بنود</td></tr>'; elements.purchaseDetailNotes.textContent = invoice.notes || "لا توجد ملاحظات"; } catch (error) { elements.purchaseDetailMeta.textContent = error.message; elements.purchaseDetailItems.innerHTML = '<tr><td colspan="5">تعذّر تحميل التفاصيل</td></tr>'; }
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
  const elements = getElements(); window.bindAdminThemeToggle?.(document.getElementById("suppliersThemeToggle")); setView(elements, "list"); loadSuppliers(elements);
  const refresh = debounce(() => { currentPage = 1; loadSuppliers(elements); }, 300);
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
  elements.invoicesBody.addEventListener("click", event => { const row = event.target.closest("[data-invoice-id]"); if (row) showPurchaseDetail(elements, row.dataset.invoiceId); }); document.getElementById("closePurchaseDetail").addEventListener("click", () => { elements.purchaseDetailModal.hidden = true; });
  document.getElementById("runSupplierReminders").addEventListener("click", async event => { const button = event.currentTarget; button.disabled = true; try { await api.post("/api/v1/admin/supplier-reminders/run"); showToast(elements, "تم تشغيل تذكيرات استحقاقات الموردين"); } catch (error) { showToast(elements, error.message, true); } finally { button.disabled = false; } });
  return () => { requestSequence += 1; refresh.cancel?.(); elements.tableBody.removeEventListener("click", toggleStatus); elements.tableBody.removeEventListener("click", tableClick); };
}
