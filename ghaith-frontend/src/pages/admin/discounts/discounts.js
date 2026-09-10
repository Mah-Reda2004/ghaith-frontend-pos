import { api, listFrom } from "../../../core/api.js";
import { escapeHtml } from "../../../core/utils.js";

export function initDiscounts() {
  window.bindAdminThemeToggle?.(document.getElementById("discountsThemeToggle"));
  const table = document.getElementById("discountTableBody"), modal = document.getElementById("discountModal"), form = document.getElementById("discountForm"), name = document.getElementById("discountName"), value = document.getElementById("discountValue"), error = document.getElementById("discountError"), success = document.getElementById("discountSuccess"), expenseForm = document.getElementById("expenseTypeForm"), expenseName = document.getElementById("expenseTypeName"), expenseError = document.getElementById("expenseTypeError"), expenseList = document.getElementById("expenseTypeList");
  let items = [], editing = null, disposed = false;
  document.getElementById("addDiscount").hidden = true;
  const rowMarkup = item => `<tr data-id="${escapeHtml(item.id)}"><td><strong>${escapeHtml(item.name)}</strong></td><td><b class="${Number(item.discount_percent) >= 15 ? "is-warning-text" : Number(item.discount_percent) > 0 ? "is-orange-text" : ""}">${Number(item.discount_percent || 0)}%</b></td><td><span class="discount-status is-active">نشط</span></td><td><button class="discount-edit" type="button" aria-label="تعديل خصم ${escapeHtml(item.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z"/></svg></button></td></tr>`;
  const render = () => {
    table.innerHTML = items.map(rowMarkup).join("");
    const values = items.map(item => Number(item.discount_percent || 0));
    document.getElementById("discountTypesCount").textContent = items.length;
    document.getElementById("discountMax").textContent = `${values.length ? Math.max(...values) : 0}%`;
    document.getElementById("discountMin").textContent = `${values.length ? Math.min(...values) : 0}%`;
  };
  const load = async () => { try { items = listFrom(await api.get("/api/v1/customer-types")); if (!disposed) render(); } catch (e) { if (!disposed) { table.innerHTML = `<tr><td colspan="4">${escapeHtml(e.message)}</td></tr>`; } } };
  const loadExpenseTypes = async () => { try { const types = listFrom(await api.get("/api/v1/expense-types")); if (!disposed) expenseList.innerHTML = types.map(item => `<span>${escapeHtml(item.name || String(item))}</span>`).join("") || "لا توجد أنواع مصروفات بعد."; } catch (e) { if (!disposed) expenseList.textContent = e.message; } };
  const setOpen = open => { modal.hidden = !open; document.body.style.overflow = open ? "hidden" : ""; };
  const onTable = event => { const button = event.target.closest(".discount-edit"); if (!button) return; editing = items.find(item => String(item.id) === button.closest("tr").dataset.id); if (!editing) return; name.value = editing.name; value.value = editing.discount_percent || 0; error.textContent = ""; setOpen(true); };
  const submit = async event => { event.preventDefault(); const amount = Number(value.value); if (!editing || !name.value.trim() || !Number.isFinite(amount) || amount < 0 || amount > 100) { error.textContent = "أدخل اسمًا ونسبة بين 0 و100"; return; } const button = document.getElementById("saveDiscount"); button.disabled = true; try { await api.patch(`/api/v1/admin/customer-types/${encodeURIComponent(editing.id)}`, { name: name.value.trim(), discount_percent: amount }); setOpen(false); success.hidden = false; await load(); } catch (e) { error.textContent = e.message; } finally { button.disabled = false; } };
  const submitExpenseType = async event => { event.preventDefault(); const typeName = expenseName.value.trim(), button = document.getElementById("saveExpenseType"); if (!typeName) { expenseError.textContent = "أدخل اسم نوع المصروف."; expenseName.focus(); return; } button.disabled = true; expenseError.textContent = ""; try { await api.post("/api/v1/admin/expense-types", { name: typeName }); expenseName.value = ""; await loadExpenseTypes(); } catch (e) { expenseError.textContent = e.message; } finally { button.disabled = false; } };
  table.addEventListener("click", onTable); form.addEventListener("submit", submit); expenseForm.addEventListener("submit", submitExpenseType); modal.addEventListener("click", event => { if (event.target === modal || event.target.closest("[data-close]")) setOpen(false); }); document.getElementById("closeSuccess").addEventListener("click", () => { success.hidden = true; });
  load(); loadExpenseTypes();
  return () => { disposed = true; document.body.style.overflow = ""; table.removeEventListener("click", onTable); form.removeEventListener("submit", submit); expenseForm.removeEventListener("submit", submitExpenseType); };
}
