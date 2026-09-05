import { debounce, escapeHtml } from "../../../core/utils.js";

const DEFAULT_INVENTORY_CHARTS = {
  movement: {
    labels: ["أسبوع 4", "أسبوع 3", "أسبوع 2", "أسبوع 1"],
    incoming: [350, 150, 400, 280],
    outgoing: [160, 260, 275, 150],
    max: 500
  },
  distribution: {
    total: "15.3K",
    totalLabel: "إجمالي القطع",
    items: [
      { label: "عبايات فاخرة", value: 45, tone: "orange" },
      { label: "طرح ونقابات", value: 25, tone: "warning" },
      { label: "إسدالات صلاة", value: 15, tone: "brown" },
      { label: "إكسسوارات", value: 15, tone: "muted" }
    ]
  }
};

const DISTRIBUTION_COLORS = {
  orange: "var(--color-primary)",
  warning: "var(--color-warning)",
  brown: "color-mix(in srgb, var(--color-primary) 30%, var(--color-text-faint))",
  muted: "var(--color-surface-hover)"
};

let currentInventoryCharts = DEFAULT_INVENTORY_CHARTS;

function toChartNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function renderMovementChart(data = DEFAULT_INVENTORY_CHARTS.movement) {
  const chart = document.getElementById("inventoryMovementChart");
  if (!chart) return;
  const width = 640;
  const height = 280;
  const padding = 42;
  const labels = Array.isArray(data.labels) && data.labels.length ? data.labels : DEFAULT_INVENTORY_CHARTS.movement.labels;
  const incoming = Array.isArray(data.incoming) ? data.incoming.map(toChartNumber) : DEFAULT_INVENTORY_CHARTS.movement.incoming;
  const outgoing = Array.isArray(data.outgoing) ? data.outgoing.map(toChartNumber) : DEFAULT_INVENTORY_CHARTS.movement.outgoing;
  const count = Math.max(labels.length, incoming.length, outgoing.length);
  const highestValue = Math.max(...incoming, ...outgoing, 1);
  const requestedMax = toChartNumber(data.max);
  const max = Math.max(requestedMax, Math.ceil(highestValue / 100) * 100);
  const chartHeight = height - (padding * 2);
  const groupWidth = (width - (padding * 2)) / count;
  const barWidth = groupWidth * 0.38;
  const grid = Array.from({ length: 6 }, (_, index) => (max / 5) * index).map(value => {
    const y = height - padding - ((value / max) * chartHeight);
    return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="var(--color-border)"/><text x="${width - padding + 15}" y="${y + 4}" fill="var(--color-text-muted)" font-size="11">${Math.round(value)}</text>`;
  }).join("");
  const bars = Array.from({ length: count }, (_, index) => {
    const incomingValue = incoming[index] || 0;
    const outgoingValue = outgoing[index] || 0;
    const groupX = padding + (index * groupWidth);
    const incomingHeight = (incomingValue / max) * chartHeight;
    const outgoingHeight = (outgoingValue / max) * chartHeight;
    return `<rect x="${groupX + (groupWidth * 0.12)}" y="${height - padding - outgoingHeight}" width="${barWidth}" height="${outgoingHeight}" rx="2" fill="var(--color-surface-hover)"/><rect x="${groupX + (groupWidth * 0.5)}" y="${height - padding - incomingHeight}" width="${barWidth}" height="${incomingHeight}" rx="2" fill="var(--color-primary)"/><text x="${groupX + (groupWidth / 2)}" y="${height - 14}" text-anchor="middle" fill="var(--color-text-muted)" font-size="11">${escapeHtml(labels[index] || "")}</text>`;
  }).join("");
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="الوارد والمنصرف خلال أربعة أسابيع">${grid}${bars}</svg>`;
}

export function renderDistributionChart(data = DEFAULT_INVENTORY_CHARTS.distribution) {
  const chart = document.getElementById("inventoryDistributionChart");
  const legend = document.getElementById("inventoryDistributionLegend");
  if (!chart || !legend) return;
  const sourceItems = Array.isArray(data.items) && data.items.length ? data.items : DEFAULT_INVENTORY_CHARTS.distribution.items;
  const items = sourceItems.map(item => ({
    label: String(item.label || ""),
    value: toChartNumber(item.value),
    tone: Object.hasOwn(DISTRIBUTION_COLORS, item.tone) ? item.tone : "muted"
  }));
  const valuesTotal = items.reduce((total, item) => total + item.value, 0) || 100;
  let offset = 0;
  const segments = items.map(item => {
    const value = (item.value / valuesTotal) * 100;
    const segment = `<circle cx="60" cy="60" r="48" pathLength="100" fill="none" stroke="${DISTRIBUTION_COLORS[item.tone]}" stroke-width="16" stroke-dasharray="${value} ${100 - value}" stroke-dashoffset="${-offset}"/>`;
    offset += value;
    return segment;
  }).join("");
  const total = escapeHtml(data.total ?? DEFAULT_INVENTORY_CHARTS.distribution.total);
  const totalLabel = escapeHtml(data.totalLabel ?? DEFAULT_INVENTORY_CHARTS.distribution.totalLabel);
  chart.innerHTML = `<svg viewBox="0 0 120 120" role="img" aria-label="${totalLabel} ${total}"><g transform="rotate(-90 60 60)">${segments}</g><text x="60" y="57" text-anchor="middle" fill="var(--color-text)" font-size="15" font-weight="700">${total}</text><text x="60" y="70" text-anchor="middle" fill="var(--color-text-muted)" font-size="7">${totalLabel}</text></svg>`;
  legend.innerHTML = items.map(item => `<span><i class="is-${item.tone}"></i>${escapeHtml(item.label)} <b>${Math.round(item.value)}%</b></span>`).join("");
}

export function updateInventoryCharts(data = {}) {
  currentInventoryCharts = {
    movement: data.movement || currentInventoryCharts.movement,
    distribution: data.distribution || currentInventoryCharts.distribution
  };
  renderMovementChart(currentInventoryCharts.movement);
  renderDistributionChart(currentInventoryCharts.distribution);
}

function bindInventorySearch() {
  const searchInput = document.getElementById("inventorySearch");
  const tableBody = document.getElementById("inventoryTableBody");
  const emptyState = document.getElementById("inventoryEmpty");
  if (!searchInput || !tableBody || !emptyState) return () => {};

  const rows = Array.from(tableBody.querySelectorAll("tr"));
  const filterRows = debounce(() => {
    const query = searchInput.value.trim().toLocaleLowerCase("ar");
    let visibleRows = 0;
    rows.forEach(row => {
      const isVisible = row.dataset.search.toLocaleLowerCase("ar").includes(query);
      row.hidden = !isVisible;
      if (isVisible) visibleRows += 1;
    });
    emptyState.hidden = visibleRows > 0;
    tableBody.hidden = visibleRows === 0;
  });

  searchInput.addEventListener("input", filterRows);
  return () => searchInput.removeEventListener("input", filterRows);
}

function bindPagination() {
  const pagination = document.querySelector(".inventory-pagination");
  if (!pagination) return () => {};
  const handlePage = event => {
    const button = event.target.closest(".page-btn");
    if (!button || !/^\d+$/.test(button.textContent.trim())) return;
    pagination.querySelectorAll(".page-btn").forEach(item => item.classList.toggle("is-active", item === button));
  };
  pagination.addEventListener("click", handlePage);
  return () => pagination.removeEventListener("click", handlePage);
}

export function initInventory() {
  window.bindAdminThemeToggle?.(document.getElementById("inventoryThemeToggle"));
  currentInventoryCharts = DEFAULT_INVENTORY_CHARTS;
  updateInventoryCharts(window.ghaithInventoryData || DEFAULT_INVENTORY_CHARTS);
  const cleanupSearch = bindInventorySearch();
  const cleanupPagination = bindPagination();
  const handleDataUpdate = event => updateInventoryCharts(event.detail || {});
  document.addEventListener("ghaith:inventory-data", handleDataUpdate);
  return () => {
    cleanupSearch();
    cleanupPagination();
    document.removeEventListener("ghaith:inventory-data", handleDataUpdate);
  };
}
