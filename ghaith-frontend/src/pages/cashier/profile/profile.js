import { api, listFrom } from "../../../core/api.js";
import { escapeHtml } from "../../../core/utils.js";

(async function initProfilePage() {
  const showAllButton = document.getElementById("profileShowAll");
  const profileName = document.querySelector("[data-profile-name]");
  const loggedInName = document.getElementById("cashierUserMenu")?.dataset.userName;

  if (profileName && loggedInName) profileName.textContent = loggedInName;
  try {
    const response = await api.get("/api/v1/commissions/me");
    const summary = response?.summary || response?.totals || response?.data?.summary || response?.data || response;
    const commission = Number(summary.total_commission ?? summary.commission_amount ?? summary.today_commission ?? 0);
    const sales = Number(summary.total_sales ?? summary.sales_amount ?? 0);
    const count = Number(summary.invoice_count ?? summary.sales_count ?? 0);
    const values = document.querySelectorAll(".profile-stat__value");
    if (values[0]) values[0].textContent = `EGP ${sales.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    if (values[1]) values[1].textContent = count.toLocaleString("ar-EG");
    if (values[2]) values[2].textContent = `EGP ${commission.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const items = listFrom(response);
    const body = document.querySelector(".profile-transactions tbody");
    if (body) body.innerHTML = items.map(item => `<tr><td class="num" dir="ltr">${escapeHtml(item.invoice_number || item.reference_number || "—")}</td><td class="num">${item.created_at ? new Date(item.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "—"}</td><td>${Number(item.items_count || item.quantity || 0)} قطع</td><td class="profile-commission num" dir="ltr">EGP ${Number(item.commission_amount || item.amount || 0).toLocaleString("en-US")}</td></tr>`).join("") || '<tr><td colspan="4">لا توجد عمولات مسجلة.</td></tr>';
  } catch { /* تظل الصفحة قابلة للاستخدام إذا كانت العمولة غير متاحة لهذا الدور */ }
  if (!showAllButton) return;

  showAllButton.addEventListener("click", () => {
    if (document.documentElement.dataset.cashierSpa === "true") {
      window.location.hash = "invoices";
      return;
    }
    window.location.href = "../cashier.html#invoices";
  });
})();
