import { api, idempotencyKey } from "../../../core/api.js";
import { logout } from "../../../core/auth.js";

const money = value => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const labels = { cash: "نقدي", card: "بطاقة", wallet: "محفظة", instapay: "إنستا باي", transfer: "تحويل", deferred: "آجل" };
let currentShift = null, summary = null;

function toast(message, error = false) { const stack = document.getElementById("toastStack"); const node = document.createElement("div"); node.className = `toast${error ? " is-error" : ""}`; node.textContent = message; stack.append(node); setTimeout(() => node.remove(), 3000); }

function render(data) {
  summary = data?.summary || data;
  const metrics = document.querySelectorAll(".sc-overview .sc-metric strong");
  const values = [summary.total_sales ?? summary.sales_total ?? 0, summary.invoice_count ?? summary.sales_count ?? 0, summary.card_total ?? summary.card_sales ?? 0, summary.cash_total ?? summary.cash_sales ?? 0, summary.returns_total ?? summary.total_returns ?? 0];
  metrics.forEach((node, index) => { node.innerHTML = index === 1 ? String(values[index]) : `${money(values[index])} <small>ج.م</small>`; });
  const expenses = summary.total_expenses ?? summary.expenses_total ?? summary.cash_expenses ?? 0;
  document.querySelectorAll(".sc-danger-value, .sc-expenses-bar__value, .sc-metric--expense-total strong").forEach(node => { node.textContent = `${money(expenses)} ج.م`; });
  const expensesCount = summary.expense_count ?? summary.expenses_count ?? 0;
  const countNode = document.querySelector(".sc-count-pill");
  if (countNode) countNode.textContent = `${Number(expensesCount).toLocaleString("en-US")} حركات`;
  const breakdown = summary.payment_breakdown || summary.payments || [];
  const rows = Array.isArray(breakdown) ? breakdown : Object.entries(breakdown).map(([method, value]) => ({ method, ...(typeof value === "object" ? value : { amount: value }) }));
  const total = rows.reduce((sum, item) => sum + Number(item.amount || item.total || item.counted_amount || 0), 0) || 1;
  document.querySelector(".sc-pay-table tbody").innerHTML = rows.map(item => { const amount = Number(item.amount || item.total || item.counted_amount || 0), percent = amount / total * 100; return `<tr><td><div class="sc-method-cell">${labels[item.method] || item.method}</div></td><td>${item.count || item.transactions || 0}</td><td>${money(amount)}</td><td><div class="sc-percent-cell"><span>${percent.toFixed(1)}%</span><div class="sc-percent-bar"><div class="sc-percent-bar__fill" style="width:${percent}%"></div></div></div></td></tr>`; }).join("") || '<tr><td colspan="4">لا توجد عمليات دفع في هذه الوردية.</td></tr>';
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
  const confirmButton = event.currentTarget;
  const input = document.getElementById("countedCash"), amount = Number(input.value), error = document.getElementById("countedCashError");
  if (input.value === "" || amount < 0) { error.textContent = "أدخل النقدية الفعلية في الدرج."; input.focus(); return; }
  confirmButton.disabled = true; error.textContent = "";
  try {
    const breakdown = summary?.payment_breakdown || summary?.payments || [];
    const rows = Array.isArray(breakdown) ? breakdown : Object.entries(breakdown).map(([method, value]) => ({ method, ...(typeof value === "object" ? value : { amount: value }) }));
    const paymentCounts = rows.map(item => ({ method: item.method, counted_amount: item.method === "cash" ? amount : Number(item.counted_amount ?? item.amount ?? item.total ?? 0) }));
    if (!paymentCounts.some(item => item.method === "cash")) paymentCounts.push({ method: "cash", counted_amount: amount });
    await api.post(`/api/v1/shifts/${encodeURIComponent(currentShift.id)}/close`, { counted_cash: amount, payment_counts: paymentCounts, notes: null, expected_version: Number(currentShift.version || 1) }, { headers: { "Idempotency-Key": idempotencyKey() } });
    document.getElementById("confirmModal").style.display = "none";
    document.getElementById("successOverlay").style.display = "flex";
    window.setTimeout(() => { logout(); window.location.replace(new URL("../auth/login/login.html", window.location.href).href); }, 900);
  }
  catch (apiError) { error.textContent = apiError.message; }
  finally { confirmButton.disabled = false; }
});
document.getElementById("printReportBtn")?.addEventListener("click", () => window.GhaithPrint?.printTable({ title: "تقرير إغلاق الوردية", table: document.querySelector(".sc-pay-table"), summary: summary ? Object.entries(summary).filter(([, value]) => typeof value !== "object").slice(0, 6).map(([label, value]) => ({ label, value })) : [] }));
loadShift();
