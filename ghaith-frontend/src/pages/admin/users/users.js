import { api } from "../../../core/api.js";
import { debounce, escapeHtml } from "../../../core/utils.js";

const API_PAGE_SIZE = 100;
const UI_PAGE_SIZE = 20;
const ROLE_LABELS = { admin: "مدير نظام", cashier: "كاشير", sales: "سيلز" };
let users = [];
let roleIds = {};
let currentPage = 1;
let requestSequence = 0;

function addPhoneField() {
  if (document.getElementById("userPhone")) return;
  const usernameField = document.getElementById("userUsername").closest(".field");
  const field = document.createElement("div");
  field.className = "field";
  field.innerHTML = '<label for="userPhone">رقم الهاتف <b>*</b></label><input class="input" id="userPhone" type="tel" dir="ltr" placeholder="01012345678" autocomplete="tel" required><small class="users-field-error" id="userPhoneError" hidden>يرجى إدخال رقم هاتف صحيح.</small>';
  usernameField.after(field);
  const passwordField = document.getElementById("userPassword").closest(".field");
  passwordField.id = "userPasswordField";
  passwordField.insertAdjacentHTML("beforeend", '<small class="users-field-error" id="userPasswordError" hidden>كلمة المرور يجب ألا تقل عن 10 أحرف.</small>');
  document.querySelector(".users-page").insertAdjacentHTML("beforeend", `
    <div class="modal-overlay users-success-modal users-confirm-modal" id="userDeactivateModal" hidden>
      <section class="modal users-success users-confirm" role="alertdialog" aria-modal="true" aria-labelledby="userDeactivateTitle" aria-describedby="userDeactivateText">
        <span class="users-success__icon users-confirm__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/></svg></span>
        <h2 id="userDeactivateTitle">تعطيل المستخدم</h2>
        <p id="userDeactivateText">هل أنت متأكد من تعطيل <strong id="userDeactivateName">—</strong>؟ لن يتمكن المستخدم من تسجيل الدخول.</p>
        <div class="users-confirm__actions"><button class="btn btn-outline" id="cancelUserDeactivate" type="button">إلغاء</button><button class="btn users-confirm__submit" id="confirmUserDeactivate" type="button">تعطيل المستخدم</button></div>
      </section>
    </div>`);
}

function getElements() {
  addPhoneField();
  return {
    themeToggle: document.getElementById("usersThemeToggle"), addButton: document.getElementById("addUserBtn"),
    totalStat: document.getElementById("usersTotalStat"), adminsStat: document.getElementById("usersAdminsStat"), cashiersStat: document.getElementById("usersCashiersStat"), salesStat: document.getElementById("usersSalesStat"),
    search: document.getElementById("usersSearch"), roleFilter: document.getElementById("usersRoleFilter"), statusFilter: document.getElementById("usersStatusFilter"),
    tableBody: document.getElementById("usersTableBody"), empty: document.getElementById("usersEmpty"), paginationInfo: document.getElementById("usersPaginationInfo"), pagination: document.querySelector(".users-pagination .pagination__pages"),
    modal: document.getElementById("userModal"), modalTitle: document.getElementById("userModalTitle"), closeModal: document.getElementById("closeUserModal"), form: document.getElementById("userForm"),
    id: document.getElementById("userId"), username: document.getElementById("userUsername"), phone: document.getElementById("userPhone"), phoneError: document.getElementById("userPhoneError"),
    password: document.getElementById("userPassword"), passwordField: document.getElementById("userPasswordField"), passwordError: document.getElementById("userPasswordError"), togglePassword: document.getElementById("toggleUserPassword"),
    role: document.getElementById("userRole"), status: document.getElementById("userStatus"), nameError: document.getElementById("userNameError"), cancelModal: document.getElementById("cancelUserModal"), saveButton: document.getElementById("saveUserBtn"),
    successModal: document.getElementById("userSuccessModal"), successName: document.getElementById("successUserName"), successPhone: document.getElementById("successUserEmail"), successRole: document.getElementById("successUserRole"), successStatus: document.getElementById("successUserStatus"), successDate: document.getElementById("successUserDate"), backButton: document.getElementById("backToUsers"), toastStack: document.getElementById("usersToastStack"),
    deactivateModal: document.getElementById("userDeactivateModal"), deactivateName: document.getElementById("userDeactivateName"), cancelDeactivate: document.getElementById("cancelUserDeactivate"), confirmDeactivate: document.getElementById("confirmUserDeactivate")
  };
}

function normalizeUser(item) {
  const role = item.roles?.name || item.role?.name || item.role || "unknown";
  if (item.role_id && ["admin", "cashier", "sales"].includes(role)) roleIds[role] = item.role_id;
  return {
    id: item.id, displayName: item.name || item.username || "—", username: item.username || "—", phone: item.phone || "",
    role, roleId: item.role_id || "", status: item.is_active === false ? "inactive" : "active", createdAt: item.created_at
  };
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function filteredUsers(elements) {
  const term = elements.search.value.trim().toLocaleLowerCase("ar");
  const role = elements.roleFilter.value;
  const status = elements.statusFilter.value;
  return users.filter(user => (!term || `${user.displayName} ${user.username} ${user.phone}`.toLocaleLowerCase("ar").includes(term))
    && (role === "all" || user.role === role) && (status === "all" || user.status === status));
}

function renderSummary(elements) {
  const active = users.filter(user => user.status === "active");
  elements.totalStat.textContent = users.length.toLocaleString("ar-EG");
  elements.adminsStat.textContent = active.filter(user => user.role === "admin").length.toLocaleString("ar-EG");
  elements.cashiersStat.textContent = active.filter(user => user.role === "cashier").length.toLocaleString("ar-EG");
  elements.salesStat.textContent = active.filter(user => user.role === "sales").length.toLocaleString("ar-EG");
}

function renderPagination(elements, total) {
  const pages = Math.max(1, Math.ceil(total / UI_PAGE_SIZE));
  currentPage = Math.min(currentPage, pages);
  const candidates = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pages])].filter(page => page >= 1 && page <= pages).sort((a, b) => a - b);
  const previousIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  const nextIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  elements.pagination.innerHTML = `<button class="page-btn page-btn--arrow" type="button" data-page="${currentPage + 1}" ${currentPage === pages ? "disabled" : ""} aria-label="التالي">${nextIcon}</button>${candidates.map((page, index) => `${index && page - candidates[index - 1] > 1 ? '<span class="pagination__ellipsis">…</span>' : ""}<button class="page-btn${page === currentPage ? " is-active" : ""}" type="button" data-page="${page}">${page}</button>`).join("")}<button class="page-btn page-btn--arrow" type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""} aria-label="السابق">${previousIcon}</button>`;
}

function renderUsers(elements) {
  document.querySelector(".users-table thead").innerHTML = "<tr><th>المعرّف</th><th>المستخدم</th><th>اسم المستخدم</th><th>الهاتف</th><th>الدور</th><th>تاريخ الإنشاء</th><th>الحالة</th><th>الإجراءات</th></tr>";
  const filtered = filteredUsers(elements);
  const start = (currentPage - 1) * UI_PAGE_SIZE;
  const pageUsers = filtered.slice(start, start + UI_PAGE_SIZE);
  elements.tableBody.innerHTML = pageUsers.map(user => `<tr>
    <td class="num" dir="ltr">${escapeHtml(String(user.id))}</td><td>${escapeHtml(user.displayName)}</td><td class="users-username"><bdi dir="ltr">${escapeHtml(user.username)}</bdi></td><td class="num" dir="ltr">${escapeHtml(user.phone || "—")}</td><td>${escapeHtml(ROLE_LABELS[user.role] || user.role)}</td><td>${dateLabel(user.createdAt)}</td>
    <td><button class="status-toggle status-toggle--table${user.status === "active" ? "" : " is-inactive"}" type="button" role="switch" aria-checked="${user.status === "active"}" data-action="toggle-status" data-id="${escapeHtml(String(user.id))}"><span class="status-toggle__label">${user.status === "active" ? "نشط" : "غير نشط"}</span><span class="status-toggle__track" aria-hidden="true"><span class="status-toggle__thumb"></span></span></button></td>
    <td><div class="users-actions"><button class="users-action users-action--edit" type="button" data-action="edit" data-id="${escapeHtml(String(user.id))}" aria-label="تعديل المستخدم"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="users-action users-action--delete" type="button" data-action="delete" data-id="${escapeHtml(String(user.id))}" aria-label="تعطيل المستخدم"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="7" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11h5"/></svg></button></div></td>
  </tr>`).join("");
  elements.empty.hidden = pageUsers.length > 0;
  const from = pageUsers.length ? start + 1 : 0;
  elements.paginationInfo.textContent = `عرض ${from} إلى ${start + pageUsers.length} من ${filtered.length} مستخدم`;
  renderSummary(elements);
  renderPagination(elements, filtered.length);
}

function showToast(elements, message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast toast--${isError ? "error" : "success"}`;
  toast.textContent = message;
  elements.toastStack.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

async function loadUsers(elements) {
  const sequence = ++requestSequence;
  elements.tableBody.setAttribute("aria-busy", "true");
  elements.paginationInfo.textContent = "جاري تحميل المستخدمين...";
  try {
    const first = await api.get("/api/v1/admin/users", { query: { page: 1, page_size: API_PAGE_SIZE } });
    const totalPages = Math.ceil(Number(first.total || first.items?.length || 0) / API_PAGE_SIZE);
    const rest = totalPages > 1 ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => api.get("/api/v1/admin/users", { query: { page: index + 2, page_size: API_PAGE_SIZE } }))) : [];
    if (sequence !== requestSequence) return;
    roleIds = {};
    users = [first, ...rest].flatMap(response => response.items || []).map(normalizeUser);
    renderUsers(elements);
  } catch (error) {
    if (sequence !== requestSequence) return;
    users = [];
    renderUsers(elements);
    showToast(elements, error.message, true);
  } finally { if (sequence === requestSequence) elements.tableBody.setAttribute("aria-busy", "false"); }
}

function setModalTitle(elements, text) {
  const node = [...elements.modalTitle.childNodes].find(item => item.nodeType === Node.TEXT_NODE);
  if (node) node.textContent = text;
}

function openUserModal(elements, user = null) {
  elements.form.reset();
  elements.nameError.hidden = true; elements.phoneError.hidden = true; elements.passwordError.hidden = true;
  elements.id.value = user?.id || ""; elements.username.value = user?.username || ""; elements.phone.value = user?.phone || "";
  elements.role.value = user?.role || "cashier"; elements.status.value = user?.status || "active";
  elements.username.readOnly = Boolean(user); elements.passwordField.hidden = Boolean(user); elements.password.required = !user;
  setModalTitle(elements, user ? "تعديل المستخدم" : "إضافة مستخدم جديد");
  elements.saveButton.textContent = user ? "حفظ التعديلات" : "إضافة المستخدم";
  elements.modal.hidden = false; document.body.classList.add("modal-open"); requestAnimationFrame(() => (user ? elements.phone : elements.username).focus());
}

function closeModal(elements) { elements.modal.hidden = true; document.body.classList.remove("modal-open"); }
function closeSuccess(elements) { elements.successModal.hidden = true; document.body.classList.remove("modal-open"); }

function confirmDeactivation(elements, user) {
  elements.deactivateName.textContent = user.displayName;
  elements.deactivateModal.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => elements.cancelDeactivate.focus());
  return new Promise(resolve => {
    const finish = confirmed => {
      elements.deactivateModal.hidden = true;
      document.body.classList.remove("modal-open");
      elements.cancelDeactivate.removeEventListener("click", cancel);
      elements.confirmDeactivate.removeEventListener("click", confirm);
      elements.deactivateModal.removeEventListener("click", overlay);
      resolve(confirmed);
    };
    const cancel = () => finish(false);
    const confirm = () => finish(true);
    const overlay = event => { if (event.target === elements.deactivateModal) cancel(); };
    elements.cancelDeactivate.addEventListener("click", cancel);
    elements.confirmDeactivate.addEventListener("click", confirm);
    elements.deactivateModal.addEventListener("click", overlay);
  });
}

function showSuccess(elements, user) {
  elements.successName.textContent = user.displayName;
  elements.successPhone.textContent = user.phone || "—";
  elements.successRole.textContent = ROLE_LABELS[user.role] || user.role;
  elements.successStatus.textContent = user.status === "active" ? "نشط" : "غير نشط";
  elements.successStatus.className = `users-status users-status--${user.status}`;
  elements.successDate.textContent = dateLabel(user.createdAt);
  elements.successModal.hidden = false; document.body.classList.add("modal-open");
}

async function saveUser(elements) {
  const id = elements.id.value;
  const username = elements.username.value.trim();
  const phone = elements.phone.value.trim();
  const role = elements.role.value;
  elements.nameError.hidden = username.length >= 3;
  elements.phoneError.hidden = id ? Boolean(phone) : /^\+?[0-9]{10,15}$/.test(phone);
  if (!elements.nameError.hidden) { elements.username.focus(); return; }
  if (!elements.phoneError.hidden) { elements.phone.focus(); return; }
  if (!role) { showToast(elements, "اختر الدور الوظيفي", true); elements.role.focus(); return; }
  elements.passwordError.hidden = Boolean(id) || elements.password.value.length >= 10;
  if (!elements.passwordError.hidden) { elements.password.focus(); return; }
  elements.saveButton.disabled = true;
  try {
    let response;
    if (id) {
      const roleId = roleIds[role];
      if (!roleId) throw new Error("تعذّر تحديد معرّف الدور المطلوب.");
      response = await api.patch(`/api/v1/admin/users/${encodeURIComponent(id)}`, { phone, role_id: roleId, is_active: elements.status.value === "active" });
    } else {
      response = await api.post("/api/v1/admin/users", { username, phone, password: elements.password.value, role });
    }
    closeModal(elements);
    await loadUsers(elements);
    const saved = users.find(user => user.id === response?.id || user.username === username) || normalizeUser({ ...response, username, phone, roles: { name: role }, is_active: elements.status.value === "active" });
    showSuccess(elements, saved);
  } catch (error) { showToast(elements, error.message, true); }
  finally { elements.saveButton.disabled = false; }
}

export function initUsers() {
  const elements = getElements();
  window.bindAdminThemeToggle?.(elements.themeToggle);
  loadUsers(elements);
  const refresh = debounce(() => { currentPage = 1; renderUsers(elements); }, 180);
  const onTableClick = async event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const user = users.find(item => String(item.id) === button.dataset.id);
    if (!user) return;
    if (button.dataset.action === "edit") openUserModal(elements, user);
    if (button.dataset.action === "toggle-status") {
      button.disabled = true;
      const active = user.status !== "active";
      try { await api.patch(`/api/v1/admin/users/${encodeURIComponent(user.id)}`, { is_active: active }); showToast(elements, active ? "تم تفعيل المستخدم" : "تم إيقاف المستخدم"); await loadUsers(elements); }
      catch (error) { button.disabled = false; showToast(elements, error.message, true); }
    }
    if (button.dataset.action === "delete" && user.status === "active" && await confirmDeactivation(elements, user)) {
      try { await api.delete(`/api/v1/admin/users/${encodeURIComponent(user.id)}`); showToast(elements, "تم تعطيل المستخدم"); await loadUsers(elements); }
      catch (error) { showToast(elements, error.message, true); }
    }
  };
  const onSubmit = event => { event.preventDefault(); saveUser(elements); };
  const onPagination = event => { const button = event.target.closest("[data-page]"); if (!button || button.disabled) return; currentPage = Number(button.dataset.page); renderUsers(elements); };
  const onKeydown = event => { if (event.key !== "Escape") return; if (!elements.successModal.hidden) closeSuccess(elements); else if (!elements.modal.hidden) closeModal(elements); };
  elements.addButton.addEventListener("click", () => openUserModal(elements));
  elements.search.addEventListener("input", refresh); elements.roleFilter.addEventListener("change", refresh); elements.statusFilter.addEventListener("change", refresh);
  elements.tableBody.addEventListener("click", onTableClick); elements.pagination.addEventListener("click", onPagination); elements.form.addEventListener("submit", onSubmit);
  elements.closeModal.addEventListener("click", () => closeModal(elements)); elements.cancelModal.addEventListener("click", () => closeModal(elements));
  elements.togglePassword.addEventListener("click", () => {
    elements.password.type = elements.password.type === "password" ? "text" : "password";
    elements.togglePassword.setAttribute("aria-label", elements.password.type === "password" ? "إظهار كلمة المرور" : "إخفاء كلمة المرور");
  });
  elements.password.addEventListener("input", () => { elements.passwordError.hidden = true; });
  elements.backButton.addEventListener("click", () => closeSuccess(elements));
  elements.modal.addEventListener("click", event => { if (event.target === elements.modal) closeModal(elements); });
  elements.successModal.addEventListener("click", event => { if (event.target === elements.successModal) closeSuccess(elements); });
  document.addEventListener("keydown", onKeydown);
  return () => { requestSequence += 1; refresh.cancel?.(); elements.tableBody.removeEventListener("click", onTableClick); elements.pagination.removeEventListener("click", onPagination); elements.form.removeEventListener("submit", onSubmit); document.removeEventListener("keydown", onKeydown); };
}
