import { api } from "../../../core/api.js";
import { debounce, escapeHtml } from "../../../core/utils.js";

const API_PAGE_SIZE = 100;
const UI_PAGE_SIZE = 20;
let categories = [];
let summary = { total: 0, products: 0, active: 0 };
let requestSequence = 0;
let currentPage = 1;

function addFeedbackModals() {
  if (document.getElementById("categoryConfirmModal")) return;
  document.querySelector(".categories-page").insertAdjacentHTML("beforeend", `
    <div class="modal-overlay categories-feedback-overlay" id="categoryConfirmModal" hidden>
      <section class="modal categories-feedback categories-feedback--warning" role="alertdialog" aria-modal="true" aria-labelledby="categoryConfirmTitle">
        <span class="categories-feedback__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/></svg></span>
        <h2 id="categoryConfirmTitle">حذف الفئة</h2><p>هل أنت متأكد من حذف فئة <strong id="categoryConfirmName">—</strong>؟</p>
        <div class="categories-feedback__actions"><button class="btn btn-outline" id="cancelCategoryDelete" type="button">إلغاء</button><button class="btn categories-feedback__danger" id="confirmCategoryDelete" type="button">حذف الفئة</button></div>
      </section>
    </div>
    <div class="modal-overlay categories-feedback-overlay" id="categorySuccessModal" hidden>
      <section class="modal categories-feedback categories-feedback--success" role="status" aria-modal="true" aria-labelledby="categorySuccessTitle">
        <span class="categories-feedback__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg></span>
        <h2 id="categorySuccessTitle">تمت العملية بنجاح</h2><p id="categorySuccessText">تم حفظ بيانات الفئة.</p>
        <button class="btn btn-outline categories-feedback__back" id="closeCategorySuccess" type="button">العودة إلى التصنيفات</button>
      </section>
    </div>`);
}

function getElements() {
  addFeedbackModals();
  return {
    tableBody: document.getElementById("categoriesTableBody"), empty: document.getElementById("categoriesEmpty"),
    search: document.getElementById("categoriesSearch"), productsFilter: document.getElementById("categoryProductsFilter"), statusFilter: document.getElementById("categoryStatusFilter"),
    paginationInfo: document.getElementById("categoriesPaginationInfo"), pagination: document.querySelector(".categories-pagination .pagination__pages"), totalStat: document.getElementById("totalCategoriesStat"), productsStat: document.getElementById("categorizedProductsStat"), activeStat: document.getElementById("activeCategoriesStat"),
    modal: document.getElementById("categoryModal"), modalTitle: document.getElementById("categoryModalTitle"), form: document.getElementById("categoryForm"), id: document.getElementById("categoryId"),
    name: document.getElementById("categoryName"), description: document.getElementById("categoryDescription"), status: document.getElementById("categoryStatus"), nameError: document.getElementById("categoryNameError"),
    saveButton: document.getElementById("saveCategoryBtn"), toastStack: document.getElementById("categoriesToastStack"),
    confirmModal: document.getElementById("categoryConfirmModal"), confirmName: document.getElementById("categoryConfirmName"), cancelDelete: document.getElementById("cancelCategoryDelete"), confirmDelete: document.getElementById("confirmCategoryDelete"),
    successModal: document.getElementById("categorySuccessModal"), successTitle: document.getElementById("categorySuccessTitle"), successText: document.getElementById("categorySuccessText"), closeSuccess: document.getElementById("closeCategorySuccess")
  };
}

function listFrom(response) {
  if (Array.isArray(response)) return response;
  return response?.items || response?.data || response?.results || [];
}

function normalizeCategory(item) {
  return {
    id: item.id, name: item.name || "—", description: item.description || "",
    products: Number(item.product_count ?? item.products_count ?? item.products ?? 0),
    status: item.status || (item.is_active === false ? "inactive" : "active")
  };
}

function normalizeSummary(data, fallback) {
  return {
    total: Number(data?.total ?? data?.total_categories ?? fallback.length),
    products: Number(data?.products ?? data?.classified_products ?? data?.categorized_products ?? data?.total_products ?? fallback.reduce((sum, item) => sum + item.products, 0)),
    active: Number(data?.active ?? data?.active_count ?? data?.active_categories ?? fallback.filter(item => item.status === "active").length)
  };
}

function filteredCategories(elements) {
  return categories.filter(category => elements.productsFilter.value === "all"
    || (elements.productsFilter.value === "with-products" && category.products > 0)
    || (elements.productsFilter.value === "empty" && category.products === 0));
}

function renderCategories(elements) {
  const filtered = filteredCategories(elements);
  const totalPages = Math.max(1, Math.ceil(filtered.length / UI_PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * UI_PAGE_SIZE;
  const pageCategories = filtered.slice(start, start + UI_PAGE_SIZE);
  elements.tableBody.innerHTML = pageCategories.map(category => `
    <tr data-category-id="${escapeHtml(String(category.id))}">
      <td>${escapeHtml(category.name)}</td><td class="num">${category.products.toLocaleString("en-US")}</td>
      <td><span class="categories-status categories-status--${category.status}">${category.status === "active" ? "نشط" : "غير نشط"}</span></td>
      <td><div class="categories-actions"><button class="categories-action categories-action--edit" type="button" data-action="edit" aria-label="تعديل ${escapeHtml(category.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="categories-action categories-action--delete" type="button" data-action="delete" aria-label="حذف ${escapeHtml(category.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg></button></div></td>
    </tr>`).join("");
  elements.empty.hidden = pageCategories.length > 0;
  elements.tableBody.hidden = pageCategories.length === 0;
  elements.paginationInfo.textContent = pageCategories.length ? `عرض ${start + 1} إلى ${start + pageCategories.length} من ${filtered.length} فئة` : "لا توجد نتائج مطابقة";
  const pages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])].filter(page => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const previousIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  const nextIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  elements.pagination.innerHTML = `<button class="page-btn page-btn--arrow" type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""} aria-label="السابق">${previousIcon}</button>${pages.map((page, index) => `${index && page - pages[index - 1] > 1 ? '<span class="pagination__ellipsis">…</span>' : ""}<button class="page-btn${page === currentPage ? " is-active" : ""}" type="button" data-page="${page}">${page}</button>`).join("")}<button class="page-btn page-btn--arrow" type="button" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""} aria-label="التالي">${nextIcon}</button>`;
  elements.totalStat.textContent = summary.total.toLocaleString("en-US");
  elements.productsStat.textContent = summary.products.toLocaleString("en-US");
  elements.activeStat.textContent = summary.active.toLocaleString("en-US");
}

function showToast(elements, message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " is-error" : ""}`;
  toast.textContent = message;
  elements.toastStack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3000);
}

function showSuccess(elements, title, message) {
  elements.successTitle.textContent = title;
  elements.successText.textContent = message;
  elements.successModal.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => elements.closeSuccess.focus());
}

function closeSuccess(elements) {
  elements.successModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function confirmDelete(elements, category) {
  elements.confirmName.textContent = category.name;
  elements.confirmModal.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => elements.cancelDelete.focus());
  return new Promise(resolve => {
    const finish = result => {
      elements.confirmModal.hidden = true;
      document.body.classList.remove("modal-open");
      elements.cancelDelete.removeEventListener("click", cancel);
      elements.confirmDelete.removeEventListener("click", approve);
      elements.confirmModal.removeEventListener("click", overlay);
      resolve(result);
    };
    const cancel = () => finish(false);
    const approve = () => finish(true);
    const overlay = event => { if (event.target === elements.confirmModal) cancel(); };
    elements.cancelDelete.addEventListener("click", cancel);
    elements.confirmDelete.addEventListener("click", approve);
    elements.confirmModal.addEventListener("click", overlay);
  });
}

async function loadCategories(elements) {
  const sequence = ++requestSequence;
  elements.tableBody.setAttribute("aria-busy", "true");
  elements.paginationInfo.textContent = "جاري تحميل الفئات...";
  try {
    const query = { page: 1, page_size: API_PAGE_SIZE, search: elements.search.value.trim(), status: elements.statusFilter.value === "all" ? undefined : elements.statusFilter.value, sort: "name" };
    const [firstResponse, summaryResponse] = await Promise.all([api.get("/api/v1/admin/categories", { query }), api.get("/api/v1/admin/categories/summary")]);
    const pageCount = Math.ceil(Number(firstResponse?.total || listFrom(firstResponse).length) / API_PAGE_SIZE);
    const remaining = pageCount > 1 ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => api.get("/api/v1/admin/categories", { query: { ...query, page: index + 2 } }))) : [];
    if (sequence !== requestSequence) return;
    categories = [firstResponse, ...remaining].flatMap(listFrom).map(normalizeCategory);
    summary = normalizeSummary(summaryResponse, categories);
    renderCategories(elements);
  } catch (error) {
    if (sequence !== requestSequence) return;
    categories = [];
    summary = { total: 0, products: 0, active: 0 };
    renderCategories(elements);
    showToast(elements, error.message, true);
  } finally {
    if (sequence === requestSequence) elements.tableBody.setAttribute("aria-busy", "false");
  }
}

function openCategoryModal(elements, category = null) {
  elements.form.reset();
  elements.nameError.hidden = true;
  elements.id.value = category?.id || "";
  elements.name.value = category?.name || "";
  elements.description.value = category?.description || "";
  elements.status.value = category?.status || "active";
  elements.modalTitle.textContent = category ? "تعديل الفئة" : "إضافة فئة جديدة";
  elements.saveButton.textContent = category ? "حفظ التعديلات" : "حفظ الفئة";
  elements.modal.hidden = false;
  requestAnimationFrame(() => elements.name.focus());
}

function closeCategoryModal(elements) {
  elements.modal.hidden = true;
  elements.form.reset();
  elements.nameError.hidden = true;
}

async function saveCategory(elements) {
  const name = elements.name.value.trim();
  if (!name) { elements.nameError.hidden = false; elements.name.focus(); return; }
  const payload = { name, description: elements.description.value.trim() || null, status: elements.status.value };
  const id = elements.id.value;
  elements.saveButton.disabled = true;
  try {
    if (id) await api.patch(`/api/v1/admin/categories/${encodeURIComponent(id)}`, payload);
    else await api.post("/api/v1/admin/categories", payload);
    closeCategoryModal(elements);
    await loadCategories(elements);
    showSuccess(elements, id ? "تم تحديث الفئة بنجاح" : "تمت إضافة الفئة بنجاح", `تم حفظ بيانات فئة «${name}» في النظام.`);
  } catch (error) { showToast(elements, error.message, true); }
  finally { elements.saveButton.disabled = false; }
}

export function initCategories() {
  const elements = getElements();
  window.bindAdminThemeToggle?.(document.getElementById("categoriesThemeToggle"));
  loadCategories(elements);
  const refresh = debounce(() => { currentPage = 1; loadCategories(elements); }, 300);
  const filterProducts = () => { currentPage = 1; renderCategories(elements); };
  const handleTableActions = async event => {
    const action = event.target.closest("[data-action]");
    const row = action?.closest("[data-category-id]");
    if (!action || !row) return;
    const category = categories.find(item => String(item.id) === row.dataset.categoryId);
    if (!category) return;
    if (action.dataset.action === "edit") openCategoryModal(elements, category);
    if (action.dataset.action === "delete" && await confirmDelete(elements, category)) {
      if (category.products > 0) {
        showToast(elements, "لا يمكن حذف فئة تحتوي على منتجات. انقل المنتجات إلى فئة أخرى أولًا.", true);
        return;
      }
      try {
        await api.delete(`/api/v1/admin/categories/${encodeURIComponent(category.id)}`);
        await loadCategories(elements);
        showSuccess(elements, "تم حذف الفئة بنجاح", `تم حذف فئة «${category.name}» من النظام.`);
      } catch (error) { showToast(elements, error.message, true); }
    }
  };
  const handlePagination = event => {
    const button = event.target.closest("[data-page]");
    if (!button || button.disabled) return;
    currentPage = Number(button.dataset.page);
    renderCategories(elements);
  };
  const handleSubmit = event => { event.preventDefault(); saveCategory(elements); };
  const handleOverlay = event => { if (event.target === elements.modal) closeCategoryModal(elements); };
  const handleEscape = event => { if (event.key === "Escape" && !elements.modal.hidden) closeCategoryModal(elements); };
  const openButton = document.getElementById("addCategoryBtn");
  const closeButton = document.getElementById("closeCategoryModal");
  const cancelButton = document.getElementById("cancelCategoryModal");
  openButton.addEventListener("click", () => openCategoryModal(elements));
  closeButton.addEventListener("click", () => closeCategoryModal(elements));
  cancelButton.addEventListener("click", () => closeCategoryModal(elements));
  elements.form.addEventListener("submit", handleSubmit);
  elements.modal.addEventListener("click", handleOverlay);
  elements.tableBody.addEventListener("click", handleTableActions);
  elements.search.addEventListener("input", refresh);
  elements.statusFilter.addEventListener("change", refresh);
  elements.productsFilter.addEventListener("change", filterProducts);
  elements.pagination.addEventListener("click", handlePagination);
  elements.closeSuccess.addEventListener("click", () => closeSuccess(elements));
  elements.successModal.addEventListener("click", event => { if (event.target === elements.successModal) closeSuccess(elements); });
  document.addEventListener("keydown", handleEscape);
  return () => {
    requestSequence += 1;
    elements.form.removeEventListener("submit", handleSubmit);
    elements.modal.removeEventListener("click", handleOverlay);
    elements.tableBody.removeEventListener("click", handleTableActions);
    elements.search.removeEventListener("input", refresh);
    elements.statusFilter.removeEventListener("change", refresh);
    elements.productsFilter.removeEventListener("change", filterProducts);
    elements.pagination.removeEventListener("click", handlePagination);
    document.removeEventListener("keydown", handleEscape);
  };
}
