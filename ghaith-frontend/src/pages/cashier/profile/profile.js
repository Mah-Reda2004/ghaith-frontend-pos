import { api, listFrom } from "../../../core/api.js";
import { getCurrentUser, getUserRole } from "../../../core/auth.js";
import { escapeHtml } from "../../../core/utils.js";

const PERIOD_FIELDS = {
  today: ["today", "daily", "current_day"],
  week: ["this_week", "week", "weekly", "current_week"],
  month: ["this_month", "month", "monthly", "current_month"]
};
const CHART_COLORS = ["#f97316", "#fb923c", "#fbbf24", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7"];

const unwrap = response => response?.data || response || {};
const money = value => `EGP ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const numberFrom = (source, fields) => {
  for (const field of fields) {
    const value = Number(source?.[field]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
};
const summaryFrom = response => {
  const data = unwrap(response);
  return data.summary || data.totals || data.kpis || data;
};

function periodFrom(response, period) {
  const data = unwrap(response);
  const summary = summaryFrom(response);
  const performance = data.performance || summary.performance || {};
  const object = PERIOD_FIELDS[period].map(key => performance[key] || data[key] || summary[key]).find(value => value && typeof value === "object");
  if (object) return object;
  const prefix = period === "week" ? "week" : period === "month" ? "month" : "today";
  return {
    commission_amount: numberFrom(summary, [`${prefix}_commission`, `${prefix}_commissions`, `${prefix}_commission_amount`]),
    total_sales: numberFrom(summary, [`${prefix}_sales`, `${prefix}_total_sales`]),
    invoice_count: numberFrom(summary, [`${prefix}_invoice_count`, `${prefix}_invoices`, `${prefix}_sales_count`])
  };
}

function periodMetrics(period) {
  return {
    commission: numberFrom(period, ["commission_amount", "total_commission", "total_commissions", "estimated_commission", "commission", "amount"]),
    sales: numberFrom(period, ["total_sales", "sales_amount", "sales", "revenue"]),
    invoices: numberFrom(period, ["invoice_count", "completed_invoices", "total_invoices", "sales_count", "count"])
  };
}

function renderPeriodCards(dashboard) {
  ["today", "week", "month"].forEach(periodName => {
    const card = document.querySelector(`[data-period-card="${periodName}"]`);
    if (!card) return;
    const metrics = periodMetrics(periodFrom(dashboard, periodName));
    card.querySelector(".profile-stat__value").textContent = money(metrics.commission);
    card.querySelector("[data-period-details]").textContent = `مبيعات ${money(metrics.sales)} · ${metrics.invoices.toLocaleString("ar-EG")} فاتورة`;
  });
}

function weeklyPoints(response) {
  const data = unwrap(response);
  const summary = summaryFrom(response);
  const candidates = [data.weekly_performance, data.week_days, data.daily_commissions, data.daily, data.chart?.data, data.chart?.series, summary.weekly_performance];
  const series = candidates.find(Array.isArray) || [];
  return series.slice(-7).map((item, index) => {
    const value = typeof item === "number" ? item : numberFrom(item, ["commission_amount", "total_commission", "commission", "amount", "value"]);
    const rawDate = typeof item === "object" ? item.date || item.day || item.created_at : null;
    const label = typeof item === "object" && (item.label || item.day_name) || (rawDate ? new Intl.DateTimeFormat("ar-EG", { weekday: "short" }).format(new Date(rawDate)) : `يوم ${index + 1}`);
    return { label, value };
  });
}

function renderWeeklyChart(dashboard) {
  let points = weeklyPoints(dashboard);
  if (!points.length) {
    const week = periodMetrics(periodFrom(dashboard, "week"));
    if (week.commission > 0) points = [{ label: "إجمالي الأسبوع", value: week.commission }];
  }
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const chart = document.querySelector("[data-week-chart]");
  const legend = document.querySelector("[data-week-legend]");
  const totalText = money(total);
  document.querySelector("[data-chart-total]").textContent = totalText;
  document.querySelector("[data-week-total]").textContent = totalText;
  if (!total) {
    chart.style.background = "conic-gradient(var(--color-surface-hover) 0 100%)";
    legend.innerHTML = '<span class="profile-empty">لا توجد بيانات أداء لهذا الأسبوع.</span>';
    return;
  }
  let cursor = 0;
  const stops = points.map((point, index) => {
    const start = cursor;
    cursor += point.value / total * 100;
    return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${cursor}%`;
  });
  chart.style.background = `conic-gradient(${stops.join(",")})`;
  chart.setAttribute("aria-label", `توزيع عمولة الأسبوع بإجمالي ${totalText}`);
  legend.innerHTML = points.map((point, index) => `<div class="profile-legend-item"><span class="profile-legend-dot" style="--legend-color:${CHART_COLORS[index % CHART_COLORS.length]}"></span><span>${escapeHtml(point.label)}</span><strong class="num" dir="ltr">${money(point.value)}</strong></div>`).join("");
}

function commissionItems(response) {
  const direct = listFrom(response);
  if (direct.length) return direct;
  const data = unwrap(response);
  for (const key of ["commissions", "transactions", "invoices", "recent_commissions", "recent_sales"]) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function aggregateCommissionItems(response) {
  const invoices = new Map();
  commissionItems(response).forEach(item => {
    const invoice = item.invoices || item.invoice || item.sale || {};
    const invoiceNumber = item.invoice_number || item.reference_number || invoice.invoice_number || invoice.reference_number || "—";
    const invoiceId = item.invoice_id || invoice.id || invoiceNumber;
    const current = invoices.get(invoiceId) || {
      invoice_number: invoiceNumber,
      created_at: item.created_at || item.earned_at || invoice.created_at,
      commission: 0,
      total_sales: numberFrom(item, ["total_sales", "sales_amount"]),
      products: []
    };
    current.commission += numberFrom(item, ["commission_amount", "total_commission", "commission", "amount"]);
    invoices.set(invoiceId, current);
  });
  return Array.from(invoices.values());
}

function operationItems(dashboard, commissions) {
  const data = unwrap(dashboard);
  if (Array.isArray(data.recent_operations)) return data.recent_operations;
  return aggregateCommissionItems(commissions);
}

function renderRows(dashboard, commissions) {
  const body = document.querySelector(".profile-transactions tbody");
  const items = operationItems(dashboard, commissions).slice(0, 10);
  body.innerHTML = items.map(item => {
    const invoice = item.invoices || item.invoice || item.sale || {};
    const invoiceNumber = item.invoice_number || item.reference_number || invoice.invoice_number || invoice.reference_number || "—";
    const createdAt = item.created_at || item.earned_at || invoice.created_at;
    const commission = numberFrom(item, ["commission_amount", "total_commission", "commission", "amount"]);
    const totalSales = numberFrom(item, ["total_sales", "sales_amount", "total_amount"]);
    const products = Array.isArray(item.products) ? item.products : [];
    const productsText = products.length
      ? products.map(product => `${product.name || "منتج"} × ${numberFrom(product, ["quantity", "qty"])}`).join("، ")
      : `${numberFrom(item, ["items_count", "quantity", "qty", "products_count"]).toLocaleString("ar-EG")} قطع`;
    return `<tr><td class="num" dir="ltr">${escapeHtml(invoiceNumber)}</td><td>${createdAt ? new Date(createdAt).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td><td>${escapeHtml(productsText)}</td><td class="num" dir="ltr">${money(totalSales)}</td><td class="profile-commission num" dir="ltr">${money(commission)}</td></tr>`;
  }).join("") || '<tr><td colspan="5" class="profile-empty">لا توجد عمولات مسجلة حتى الآن.</td></tr>';
}

(async function initProfilePage() {
  const currentUser = getCurrentUser() || {};
  const shellName = document.getElementById("cashierUserMenu")?.dataset.userName;
  const name = currentUser.name || currentUser.full_name || currentUser.username || shellName || "المستخدم";
  document.querySelector("[data-profile-name]").textContent = name;
  document.querySelector("[data-profile-date]").textContent = new Intl.DateTimeFormat("ar-EG", { dateStyle: "long" }).format(new Date());
  document.querySelector("[data-profile-role]").textContent = getUserRole(currentUser) === "sales" ? "موظف مبيعات" : "حساب المستخدم";

  const [dashboardResult, commissionsResult] = await Promise.allSettled([
    api.get("/api/v1/commissions/me/dashboard"),
    api.get("/api/v1/commissions/me")
  ]);
  const dashboard = dashboardResult.status === "fulfilled" ? dashboardResult.value : {};
  const commissions = commissionsResult.status === "fulfilled" ? commissionsResult.value : {};
  renderPeriodCards(dashboard);
  renderWeeklyChart(dashboard);
  renderRows(dashboard, commissions);

  const showAllButton = document.getElementById("profileShowAll");
  if (getUserRole(currentUser) === "sales") {
    showAllButton.remove();
    return;
  }
  showAllButton?.addEventListener("click", () => {
    if (document.documentElement.dataset.cashierSpa === "true") window.location.hash = "invoices";
    else window.location.href = "../cashier.html#invoices";
  });
})();
