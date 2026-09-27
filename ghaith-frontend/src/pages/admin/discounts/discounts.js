import { api, listFrom } from "../../../core/api.js";
import { escapeHtml } from "../../../core/utils.js";

export function initDiscounts() {
  window.bindAdminThemeToggle?.(document.getElementById("discountsThemeToggle"));
  const table = document.getElementById("discountTableBody"), modal = document.getElementById("discountModal"), form = document.getElementById("discountForm"), name = document.getElementById("discountName"), value = document.getElementById("discountValue"), error = document.getElementById("discountError"), success = document.getElementById("discountSuccess"), expenseForm = document.getElementById("expenseTypeForm"), expenseName = document.getElementById("expenseTypeName"), expenseError = document.getElementById("expenseTypeError"), expenseList = document.getElementById("expenseTypeList"), deleteModal = document.getElementById("discountDeleteModal"), deleteName = document.getElementById("discountDeleteName"), cancelDelete = document.getElementById("cancelDiscountDelete"), confirmDelete = document.getElementById("confirmDiscountDelete");
  let items = [], editing = null, disposed = false;
  const addButton = document.getElementById("addDiscount"), modalTitle = document.getElementById("discountModalTitle"), saveButton = document.getElementById("saveDiscount");
  const discountOf = item => Number(item.discount_value ?? item.discount_amount ?? item.discount_percent ?? 0);
  const rowMarkup = item => { const discount = discountOf(item); return `<tr data-id="${escapeHtml(item.id)}"><td><strong>${escapeHtml(item.name)}</strong></td><td><b class="${discount > 0 ? "is-orange-text" : ""}">${discount.toLocaleString("en-US", { maximumFractionDigits: 2 })}%</b></td><td><span class="discount-status ${item.status === "inactive" ? "" : "is-active"}">${item.status === "inactive" ? "غير نشط" : "نشط"}</span></td><td><div class="discount-actions"><button class="discount-edit" type="button" data-action="edit" aria-label="تعديل خصم ${escapeHtml(item.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z"/></svg></button><button class="discount-delete" type="button" data-action="delete" aria-label="حذف فئة ${escapeHtml(item.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg></button></div></td></tr>`; };
  const render = () => {
    table.innerHTML = items.map(rowMarkup).join("");
    const values = items.map(discountOf);
    document.getElementById("discountTypesCount").textContent = items.length;
    document.getElementById("discountMax").textContent = `${values.length ? Math.max(...values) : 0}%`;
    document.getElementById("discountMin").textContent = `${values.length ? Math.min(...values) : 0}%`;
  };
  const load = async () => { try { items = listFrom(await api.get("/api/v1/customer-types")); if (!disposed) render(); } catch (e) { if (!disposed) { table.innerHTML = `<tr><td colspan="4">${escapeHtml(e.message)}</td></tr>`; } } };
  const loadExpenseTypes = async () => { try { const types = listFrom(await api.get("/api/v1/expense-types")); if (!disposed) expenseList.innerHTML = types.map(item => `<span>${escapeHtml(item.name || String(item))}</span>`).join("") || "لا توجد أنواع مصروفات بعد."; } catch (e) { if (!disposed) expenseList.textContent = e.message; } };
  const setOpen = open => { modal.hidden = !open; document.body.style.overflow = open ? "hidden" : ""; };
  const openEditor = item => { editing = item; form.reset(); name.value = item?.name || ""; value.value = item ? discountOf(item) : 0; error.textContent = ""; modalTitle.textContent = item ? "تعديل الخصم" : "إضافة فئة عميل"; saveButton.textContent = item ? "حفظ التعديل" : "إضافة الفئة"; setOpen(true); requestAnimationFrame(() => name.focus()); };
  const askDelete = item => new Promise(resolve => {
    deleteName.textContent = item.name;
    deleteModal.hidden = false;
    document.body.style.overflow = "hidden";
    const finish = decision => { deleteModal.hidden = true; document.body.style.overflow = ""; cancelDelete.removeEventListener("click", no); confirmDelete.removeEventListener("click", yes); deleteModal.removeEventListener("click", overlay); resolve(decision); };
    const no = () => finish(false), yes = () => finish(true), overlay = event => { if (event.target === deleteModal) no(); };
    cancelDelete.addEventListener("click", no); confirmDelete.addEventListener("click", yes); deleteModal.addEventListener("click", overlay);
  });
  const showResult = (title, message) => { success.querySelector("h3").textContent = title; success.querySelector("p").textContent = message; success.hidden = false; };
  const onTable = async event => { const button = event.target.closest("[data-action]"); if (!button) return; const item = items.find(entry => String(entry.id) === button.closest("tr").dataset.id); if (!item) return; if (button.dataset.action === "edit") openEditor(item); if (button.dataset.action === "delete") showResult("الحذف غير متاح حاليًا", "خادم الخصومات الحالي لا يوفر عملية حذف لفئات العملاء."); };
  const submit = async event => { event.preventDefault(); const amount = Number(value.value), typeName = name.value.trim(); if (!typeName || !Number.isFinite(amount) || amount < 0 || amount > 100) { error.textContent = "أدخل اسمًا وقيمة خصم صحيحة من 0 إلى 100"; return; } saveButton.disabled = true; error.textContent = ""; try { const payload = { name: typeName, discount_percent: amount }; if (editing) await api.patch(`/api/v1/admin/customer-types/${encodeURIComponent(editing.id)}`, payload); else await api.post("/api/v1/admin/customer-types", payload); setOpen(false); showResult(editing ? "تم التحديث بنجاح" : "تمت الإضافة بنجاح", `تم حفظ فئة «${typeName}».`); await load(); } catch (e) { error.textContent = e.message; } finally { saveButton.disabled = false; } };
  const submitExpenseType = async event => { event.preventDefault(); const typeName = expenseName.value.trim(), button = document.getElementById("saveExpenseType"); if (!typeName) { expenseError.textContent = "أدخل اسم نوع المصروف."; expenseName.focus(); return; } button.disabled = true; expenseError.textContent = ""; try { await api.post("/api/v1/admin/expense-types", { name: typeName }); expenseName.value = ""; await loadExpenseTypes(); } catch (e) { expenseError.textContent = e.message; } finally { button.disabled = false; } };
  addButton.addEventListener("click", () => openEditor(null)); table.addEventListener("click", onTable); form.addEventListener("submit", submit); expenseForm.addEventListener("submit", submitExpenseType); modal.addEventListener("click", event => { if (event.target === modal || event.target.closest("[data-close]")) setOpen(false); }); document.getElementById("closeSuccess").addEventListener("click", () => { success.hidden = true; });
  load(); loadExpenseTypes();
  return () => { disposed = true; document.body.style.overflow = ""; table.removeEventListener("click", onTable); form.removeEventListener("submit", submit); expenseForm.removeEventListener("submit", submitExpenseType); };
}
