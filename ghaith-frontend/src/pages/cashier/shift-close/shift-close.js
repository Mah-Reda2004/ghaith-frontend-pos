import { api, idempotencyKey } from "../../../core/api.js";

const money = value => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const labels = { cash: "نقدي", card: "بطاقة", wallet: "محفظة", instapay: "إنستا باي", transfer: "تحويل", deferred: "آجل" };
let currentShift = null, summary = null;

function toast(message, error = false) { const stack = document.getElementById("toastStack"); const node = document.createElement("div"); node.className = `toast${error ? " is-error" : ""}`; node.textContent = message; stack.append(node); setTimeout(() => node.remove(), 3000); }

function render(data) {
  summary = data?.summary || data;
  const metrics = document.querySelectorAll(".sc-overview .sc-metric strong");
  const values = [summary.total_sales, summary.invoice_count, summary.card_total, summary.cash_total, summary.returns_total];
  metrics.forEach((node, index) => { if (values[index] !== undefined) node.textContent = index === 1 ? String(values[index]) : `${money(values[index])} EGP`; });
  const expenses = summary.total_expenses ?? summary.expenses_total;
  if (expenses !== undefined) document.querySelectorAll(".sc-danger-value, .sc-expenses-bar__value, .sc-metric--expense-total strong").forEach(node => { node.textContent = `${money(expenses)} EGP`; });
  const breakdown = summary.payment_breakdown || summary.payments || [];
  const rows = Array.isArray(breakdown) ? breakdown : Object.entries(breakdown).map(([method, value]) => ({ method, ...(typeof value === "object" ? value : { amount: value }) }));
  if (rows.length) {
    const total = rows.reduce((sum, item) => sum + Number(item.amount || item.total || 0), 0) || 1;
    document.querySelector(".sc-pay-table tbody").innerHTML = rows.map(item => { const amount = Number(item.amount || item.total || 0), percent = amount / total * 100; return `<tr><td><div class="sc-method-cell">${labels[item.method] || item.method}</div></td><td>${item.count || item.transactions || 0}</td><td>${money(amount)}</td><td><div class="sc-percent-cell"><span>${percent.toFixed(1)}%</span><div class="sc-percent-bar"><div class="sc-percent-bar__fill" style="width:${percent}%"></div></div></div></td></tr>`; }).join("");
  }
}

async function loadShift() {
  try {
    const response = await api.get("/api/v1/shifts/current");
    currentShift = response?.shift || response?.data || response;
    if (!currentShift?.id) throw new Error("لا توجد وردية مفتوحة حاليًا.");
    document.getElementById("shiftDate").textContent = new Date(currentShift.opened_at || currentShift.created_at || Date.now()).toLocaleDateString("ar-EG", { dateStyle: "long" });
    render(await api.get(`/api/v1/shifts/${encodeURIComponent(currentShift.id)}/summary`));
  } catch (error) { document.getElementById("closeShiftBtn").disabled = true; toast(error.message, true); }
}

document.getElementById("viewExpensesBtn")?.addEventListener("click", () => { location.hash = "expenses"; });
document.getElementById("exportShiftBtn")?.addEventListener("click", () => window.GhaithPrint?.exportTableExcel({ title: "تقرير إغلاق الوردية", table: document.querySelector(".sc-pay-table"), fileName: "ghaith-shift" }));
document.getElementById("closeShiftBtn")?.addEventListener("click", () => { document.getElementById("confirmModal").style.display = "flex"; });
document.getElementById("cancelCloseBtn")?.addEventListener("click", () => { document.getElementById("confirmModal").style.display = "none"; });
document.getElementById("confirmCloseBtn")?.addEventListener("click", async event => {
  const input = document.getElementById("countedCash"), amount = Number(input.value), error = document.getElementById("countedCashError");
  if (input.value === "" || amount < 0) { error.textContent = "أدخل النقدية الفعلية في الدرج."; input.focus(); return; }
  event.currentTarget.disabled = true; error.textContent = "";
  try { await api.post("/api/v1/shifts/close", { counted_cash: amount, idempotency_key: idempotencyKey() }); document.getElementById("confirmModal").style.display = "none"; document.getElementById("successOverlay").style.display = "flex"; }
  catch (apiError) { error.textContent = apiError.message; }
  finally { event.currentTarget.disabled = false; }
});
document.getElementById("printReportBtn")?.addEventListener("click", () => window.GhaithPrint?.printTable({ title: "تقرير إغلاق الوردية", table: document.querySelector(".sc-pay-table"), summary: summary ? Object.entries(summary).filter(([, value]) => typeof value !== "object").slice(0, 6).map(([label, value]) => ({ label, value })) : [] }));
document.getElementById("newShiftBtn")?.addEventListener("click", async () => { try { await api.post("/api/v1/shifts/open", { opening_cash: 0 }); location.hash = "pos"; } catch (error) { toast(error.message, true); } });
document.getElementById("logoutBtn")?.addEventListener("click", () => document.querySelector('[data-user-action="logout"]')?.click());
loadShift();
