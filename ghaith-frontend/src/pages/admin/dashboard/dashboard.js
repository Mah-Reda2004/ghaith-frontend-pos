import { escapeHtml } from "../../../core/utils.js";
import { api } from "../../../core/api.js";

const EMPTY_DASHBOARD_CHARTS = { sales: { labels: [], series: { daily: [], weekly: [], monthly: [] } }, category: { total: "0", totalLabel: "الإجمالي", items: [] } };

const CATEGORY_COLORS = {
  orange: "var(--chart-1)",
  blue: "var(--chart-2)",
  green: "var(--chart-3)",
  brown: "color-mix(in srgb, var(--color-primary) 25%, var(--color-text-faint))"
};

let currentDashboardCharts = EMPTY_DASHBOARD_CHARTS;

function toChartNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function buildLinePath(values, width, height, padding) {
  const step = (width - (padding * 2)) / (values.length - 1);
  const points = values.map((value, index) => ({
    x: padding + (index * step),
    y: height - padding - ((value / 100) * (height - (padding * 2)))
  }));
  const path = points.reduce((result, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const middle = (previous.x + point.x) / 2;
    return `${result} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }, "");
  return { path, points };
}

export function renderSalesChart(period = "monthly", data = EMPTY_DASHBOARD_CHARTS.sales) {
  const chart = document.getElementById("dashboardSalesChart");
  if (!chart) return;
  const width = 680;
  const height = 280;
  const padding = 44;
  const sourceValues = data.series?.[period];
  const values = Array.isArray(sourceValues) ? sourceValues.map(toChartNumber) : [];
  if (values.length < 2) { chart.innerHTML = '<p class="empty-state">لا توجد بيانات مبيعات كافية للفترة المحددة.</p>'; return; }
  const labels = Array.isArray(data.labels) && data.labels.length === values.length
    ? data.labels
    : values.map((_, index) => String(index + 1));
  const requestedMax = toChartNumber(data.max);
  const max = Math.max(requestedMax, Math.ceil(Math.max(...values, 1) / 25) * 25);
  const normalizedValues = values.map(value => (value / max) * 100);
  const { path, points } = buildLinePath(normalizedValues, width, height, padding);
  const grid = [0, 25, 50, 75, 100].map(value => {
    const y = height - padding - ((value / 100) * (height - (padding * 2)));
    const axisValue = Math.round((value / 100) * max);
    return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="var(--color-border)" stroke-dasharray="4 5"/><text x="${padding - 10}" y="${y + 4}" text-anchor="end" fill="var(--color-text-faint)" font-size="10">${axisValue === 0 ? 0 : `${axisValue}k`}</text>`;
  }).join("");
  const axisLabels = labels.map((label, index) => `<text x="${points[index].x}" y="${height - 12}" text-anchor="middle" fill="var(--color-text-faint)" font-size="10">${escapeHtml(label)}</text>`).join("");
  const area = `${path} L ${points.at(-1).x} ${height - padding} L ${points[0].x} ${height - padding} Z`;
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="أداء المبيعات"><defs><linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--color-primary)" stop-opacity="0.3"/><stop offset="1" stop-color="var(--color-primary)" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#salesArea)"/><path d="${path}" fill="none" stroke="var(--color-primary)" stroke-width="3" stroke-linecap="round"/>${axisLabels}</svg>`;
}

export function renderCategoryChart(data = EMPTY_DASHBOARD_CHARTS.category) {
  const chart = document.getElementById("dashboardCategoryChart");
  const legend = document.getElementById("dashboardCategoryLegend");
  if (!chart || !legend) return;
  const sourceItems = Array.isArray(data.items) ? data.items : [];
  const items = sourceItems.map(item => ({
    label: String(item.label || ""),
    value: toChartNumber(item.value),
    tone: Object.hasOwn(CATEGORY_COLORS, item.tone) ? item.tone : "brown"
  }));
  const valuesTotal = items.reduce((total, item) => total + item.value, 0);
  if (!items.length || !valuesTotal) { chart.innerHTML = '<p class="empty-state">لا توجد مبيعات موزعة حسب التصنيف.</p>'; legend.innerHTML = ""; return; }
  let offset = 0;
  const segments = items.map(item => {
    const value = (item.value / valuesTotal) * 100;
    const segment = `<circle cx="60" cy="60" r="48" pathLength="100" fill="none" stroke="${CATEGORY_COLORS[item.tone]}" stroke-width="20" stroke-dasharray="${value} ${100 - value}" stroke-dashoffset="${-offset}"/>`;
    offset += value;
    return segment;
  }).join("");
  const total = escapeHtml(data.total ?? valuesTotal);
  const totalLabel = escapeHtml(data.totalLabel ?? "الإجمالي");
  chart.innerHTML = `<svg viewBox="0 0 120 120" role="img" aria-label="${totalLabel} ${total}"><g transform="rotate(-90 60 60)">${segments}</g><text x="60" y="55" text-anchor="middle" fill="var(--color-text-muted)" font-size="8">${totalLabel}</text><text x="60" y="70" text-anchor="middle" fill="var(--color-text)" font-size="13" font-weight="700">${total}</text></svg>`;
  legend.innerHTML = items.map(item => `<span><i class="is-${item.tone}"></i>${escapeHtml(item.label)} <b>${Math.round((item.value / valuesTotal) * 100)}%</b></span>`).join("");
}

export function updateDashboardCharts(data = {}, period = "monthly") {
  currentDashboardCharts = {
    sales: data.sales || currentDashboardCharts.sales,
    category: data.category || currentDashboardCharts.category
  };
  renderSalesChart(period, currentDashboardCharts.sales);
  renderCategoryChart(currentDashboardCharts.category);
}

export function initDashboard() {
  const themeButton = document.getElementById("dashboardThemeToggle");
  window.bindAdminThemeToggle?.(themeButton);
  currentDashboardCharts = EMPTY_DASHBOARD_CHARTS;
  let activePeriod = "monthly";
  updateDashboardCharts(EMPTY_DASHBOARD_CHARTS, activePeriod);
  let disposed = false;
  const loadDashboard = async period => {
    try {
      const response = await api.get("/api/v1/admin/reports/overview", { query: { period } });
      if (disposed) return;
      const data = response?.summary || response;
      const primary = [data.total_sales ?? data.sales_total, data.sales_count ?? data.invoice_count, data.net_profit ?? data.profit, data.total_expenses ?? data.expenses_total];
      document.querySelectorAll(".dashboard-stat-card .stat-value").forEach((node, index) => { if (primary[index] !== undefined) node.textContent = Number(primary[index]).toLocaleString("en-US"); });
      const quick = [data.total_purchases ?? data.purchases_total, data.total_debts ?? data.debts_total, data.inventory_value, data.product_count ?? data.total_products];
      document.querySelectorAll(".dashboard-quick-card strong").forEach((node, index) => { if (quick[index] !== undefined) node.textContent = Number(quick[index]).toLocaleString("en-US"); });
      const trend = response.sales || response.sales_chart || response.sales_trend || data.sales_chart || data.sales_trend || {};
      const categoryRows = response.category?.items || response.category_distribution || response.sales_by_category || data.category_distribution || data.sales_by_category || [];
      const values = trend.values || trend.data || trend.series?.[activePeriod] || [];
      updateDashboardCharts({
        sales: { labels: trend.labels || trend.periods || [], max: trend.max, series: { daily: values, weekly: values, monthly: values, ...(trend.series || {}) } },
        category: { total: response.category?.total ?? data.total_sales ?? 0, totalLabel: "إجمالي المبيعات", items: categoryRows.map((item, index) => ({ label: item.label || item.name || item.category_name, value: item.value ?? item.total ?? item.sales ?? 0, tone: ["orange", "blue", "green", "brown"][index % 4] })) }
      }, activePeriod);
    } catch (error) {
      const subtitle = document.querySelector(".dashboard-header .page-subtitle");
      if (subtitle) subtitle.textContent = error.message;
    }
  };
  loadDashboard("month");

  const chartTabs = document.querySelector(".dashboard-chart-tabs");
  const handlePeriod = event => {
    const button = event.target.closest("[data-chart-period]");
    if (!button) return;
    chartTabs.querySelectorAll("button").forEach(item => item.classList.toggle("is-active", item === button));
    activePeriod = button.dataset.chartPeriod;
    renderSalesChart(activePeriod, currentDashboardCharts.sales);
    loadDashboard(activePeriod);
  };
  const handleDataUpdate = event => updateDashboardCharts(event.detail || {}, activePeriod);
  chartTabs?.addEventListener("click", handlePeriod);
  document.addEventListener("ghaith:dashboard-data", handleDataUpdate);

  return () => {
    disposed = true;
    chartTabs?.removeEventListener("click", handlePeriod);
    document.removeEventListener("ghaith:dashboard-data", handleDataUpdate);
  };
}
