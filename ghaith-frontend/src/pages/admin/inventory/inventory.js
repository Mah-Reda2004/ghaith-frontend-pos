import { debounce, escapeHtml } from "../../../core/utils.js";
import { api, listFrom } from "../../../core/api.js";

const EMPTY_INVENTORY_CHARTS = { movement: { labels: [], incoming: [], outgoing: [] }, distribution: { total: "0", totalLabel: "إجمالي القطع", items: [] } };

const DISTRIBUTION_COLORS = {
  orange: "var(--color-primary)",
  warning: "var(--color-warning)",
  brown: "color-mix(in srgb, var(--color-primary) 30%, var(--color-text-faint))",
  muted: "var(--color-surface-hover)"
};

let currentInventoryCharts = EMPTY_INVENTORY_CHARTS;

function toChartNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function renderMovementChart(data = EMPTY_INVENTORY_CHARTS.movement) {
  const chart = document.getElementById("inventoryMovementChart");
  if (!chart) return;
  const width = 640;
  const height = 280;
  const padding = 42;
  const labels = Array.isArray(data.labels) ? data.labels : [];
  const incoming = Array.isArray(data.incoming) ? data.incoming.map(toChartNumber) : [];
  const outgoing = Array.isArray(data.outgoing) ? data.outgoing.map(toChartNumber) : [];
  const count = Math.max(labels.length, incoming.length, outgoing.length);
  if (!count) { chart.innerHTML = '<p class="empty-state">لا توجد بيانات حركة مخزون للفترة المحددة.</p>'; return; }
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

export function renderDistributionChart(data = EMPTY_INVENTORY_CHARTS.distribution) {
  const chart = document.getElementById("inventoryDistributionChart");
  const legend = document.getElementById("inventoryDistributionLegend");
  if (!chart || !legend) return;
  const sourceItems = Array.isArray(data.items) ? data.items : [];
  const items = sourceItems.map(item => ({
    label: String(item.label || ""),
    value: toChartNumber(item.value),
    tone: Object.hasOwn(DISTRIBUTION_COLORS, item.tone) ? item.tone : "muted"
  }));
  const valuesTotal = items.reduce((total, item) => total + item.value, 0);
  if (!items.length || !valuesTotal) { chart.innerHTML = '<p class="empty-state">لا توجد بيانات مخزون موزعة على تصنيفات.</p>'; legend.innerHTML = ""; return; }
  let offset = 0;
  const segments = items.map(item => {
    const value = (item.value / valuesTotal) * 100;
    const segment = `<circle cx="60" cy="60" r="48" pathLength="100" fill="none" stroke="${DISTRIBUTION_COLORS[item.tone]}" stroke-width="16" stroke-dasharray="${value} ${100 - value}" stroke-dashoffset="${-offset}"/>`;
    offset += value;
    return segment;
  }).join("");
  const total = escapeHtml(data.total ?? valuesTotal);
  const totalLabel = escapeHtml(data.totalLabel ?? "إجمالي القطع");
  chart.innerHTML = `<svg viewBox="0 0 120 120" role="img" aria-label="${totalLabel} ${total}"><g transform="rotate(-90 60 60)">${segments}</g><text x="60" y="57" text-anchor="middle" fill="var(--color-text)" font-size="15" font-weight="700">${total}</text><text x="60" y="70" text-anchor="middle" fill="var(--color-text-muted)" font-size="7">${totalLabel}</text></svg>`;
  legend.innerHTML = items.map(item => `<span><i class="is-${item.tone}"></i>${escapeHtml(item.label)} <b>${Math.round((item.value / valuesTotal) * 100)}%</b></span>`).join("");
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

  const filterRows = debounce(() => {
    const rows = Array.from(tableBody.querySelectorAll("tr"));
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
  currentInventoryCharts = EMPTY_INVENTORY_CHARTS;
  updateInventoryCharts(EMPTY_INVENTORY_CHARTS);
  let disposed = false;
  const tableBody = document.getElementById("inventoryTableBody");
  const empty = document.getElementById("inventoryEmpty");
  const loadInventory = async () => {
    try {
      const [response, summary] = await Promise.all([
        api.get("/api/v1/admin/products", { query: { page: 1, page_size: 100 } }),
        api.get("/api/v1/admin/products/summary")
      ]);
      if (disposed) return;
      const rows = listFrom(response).flatMap(product => (product.product_variants || product.variants || [product]).map(variant => ({ product, variant })));
      const stockOf = ({ product, variant }) => Number(variant.stock_qty ?? variant.stock_quantity ?? variant.quantity ?? product.stock_qty ?? product.stock_quantity ?? 0);
      const costOf = ({ product, variant }) => Number(variant.cost_price ?? variant.purchase_price ?? product.cost_price ?? product.purchase_price ?? 0);
      const thresholdOf = ({ product, variant }) => Number(variant.min_qty ?? variant.low_stock_threshold ?? product.min_qty ?? product.low_stock_threshold ?? 0);
      const categoryTotals = new Map();
      rows.forEach(({ product, variant }) => {
        const label = product.category?.name || product.category_name || "بدون تصنيف";
        categoryTotals.set(label, (categoryTotals.get(label) || 0) + stockOf({ product, variant }));
      });
      const movementSource = summary.stock_movement || summary.movement || summary.inventory_movement || {};
      updateInventoryCharts({
        movement: { labels: movementSource.labels || [], incoming: movementSource.incoming || movementSource.stock_in || [], outgoing: movementSource.outgoing || movementSource.stock_out || [], max: movementSource.max },
        distribution: { total: Array.from(categoryTotals.values()).reduce((sum, value) => sum + value, 0).toLocaleString("en-US"), totalLabel: "إجمالي القطع", items: Array.from(categoryTotals, ([label, value], index) => ({ label, value, tone: ["orange", "warning", "brown", "muted"][index % 4] })) }
      });
      tableBody.innerHTML = listFrom(response).map(product => {
        const productVariants = product.product_variants || product.variants || [product];
        const productRows = productVariants.map(variant => ({ product, variant }));
        const stock = productRows.reduce((sum, row) => sum + stockOf(row), 0), threshold = Number(product.min_qty ?? product.low_stock_threshold ?? 0);
        const value = productRows.reduce((sum, row) => sum + stockOf(row) * costOf(row), 0);
        const tone = stock <= 0 ? "empty" : stock <= threshold ? "low" : "good";
        const label = stock <= 0 ? "نفد تماماً" : stock <= threshold ? "منخفض" : "متاح";
        const name = product.name_ar || product.name || "منتج", sku = product.sku || productVariants[0]?.sku || "—", barcode = product.barcode || productVariants[0]?.barcode || "—", cost = costOf(productRows[0]);
        const variantsMarkup = `<div class="inventory-variants">${productRows.map(({ variant }) => `<span class="inventory-variant"><span>المقاس: <b>${escapeHtml(variant.size || "غير محدد")}</b></span><span>اللون: <b>${escapeHtml(variant.color || "غير محدد")}</b></span><small>${stockOf({ product, variant }).toLocaleString("en-US")} قطعة</small></span>`).join("")}</div>`;
        const search = `${name} ${productRows.map(({ variant }) => `${variant.sku || ""} ${variant.barcode || ""} ${variant.size || ""} ${variant.color || ""}`).join(" ")}`;
        return `<tr data-search="${escapeHtml(search.toLocaleLowerCase("ar"))}"><td><strong>${escapeHtml(name)}</strong></td><td><span class="inventory-code"><b class="num" dir="ltr">${escapeHtml(barcode)}</b><small class="num" dir="ltr">SKU: ${escapeHtml(sku)}</small></span></td><td>${variantsMarkup}</td><td>${escapeHtml(product.category?.name || product.category_name || "—")}</td><td class="num">${cost.toLocaleString("en-US")}</td><td class="num">${value.toLocaleString("en-US")}</td><td><span class="inventory-level inventory-level--${tone}"><span><b>${stock} قطعة</b><small>${threshold} حد أدنى</small></span></span></td><td><span class="inventory-status inventory-status--${tone}">${label}</span></td><td>${escapeHtml(product.supplier_name || product.supplier?.name || product.last_supplier_name || "—")}</td></tr>`;
      }).join("");
      empty.hidden = rows.length > 0; tableBody.hidden = !rows.length;
      const calculatedUnits = rows.reduce((sum, row) => sum + stockOf(row), 0);
      const calculatedValue = rows.reduce((sum, row) => sum + stockOf(row) * costOf(row), 0);
      const calculatedLowStock = rows.filter(row => { const stock = stockOf(row); return stock > 0 && stock <= thresholdOf(row); }).length;
      const stats = [
        summary.total_units ?? summary.total_quantity ?? summary.stock_qty ?? summary.stock_quantity ?? calculatedUnits,
        summary.inventory_value ?? summary.inventory_cost_value ?? summary.total_stock_value ?? calculatedValue,
        summary.low_stock_count ?? summary.low_stock_products ?? calculatedLowStock
      ];
      document.querySelectorAll(".inventory-stat__body strong").forEach((node, index) => { node.innerHTML = index === 1 ? `${Number(stats[index] || 0).toLocaleString("en-US")} <small>EGP</small>` : Number(stats[index] || 0).toLocaleString("en-US"); });
      document.querySelector(".inventory-pagination .pagination__info").textContent = `عرض ${rows.length} من ${response.total ?? rows.length} صنف`;
    } catch (error) { if (!disposed) { tableBody.innerHTML = ""; empty.hidden = false; empty.querySelector("p").textContent = error.message; } }
  };
  loadInventory();
  const cleanupSearch = bindInventorySearch();
  const cleanupPagination = bindPagination();
  const handleDataUpdate = event => updateInventoryCharts(event.detail || {});
  document.addEventListener("ghaith:inventory-data", handleDataUpdate);
  return () => {
    disposed = true;
    cleanupSearch();
    cleanupPagination();
    document.removeEventListener("ghaith:inventory-data", handleDataUpdate);
  };
}
