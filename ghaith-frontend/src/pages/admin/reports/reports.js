import { debounce, escapeHtml } from "../../../core/utils.js";
import { api, listFrom } from "../../../core/api.js";

const reportDefinition = ({ label, title, subtitle, tableTitle, search, columns, statLabels = [] }) => ({
  label, title, subtitle, tableTitle, search, columns,
  stats: statLabels.map(([name, unit = "", tone = "info", iconName = "chart"]) => [name, "0", unit, tone, "", iconName]),
  rows: [], total: "0", chart: null, sideRows: null, donut: false
});

const REPORTS = {
  sales: reportDefinition({ label: "المبيعات", title: "تقرير المبيعات", subtitle: "نظرة شاملة على أداء المبيعات والفواتير خلال الفترة المحددة", tableTitle: "تفاصيل المبيعات", search: "بحث في الفواتير...", columns: ["رقم الفاتورة", "التاريخ", "الكاشير", "العميل", "الإجمالي", "الخصم", "المدفوع", "المتبقي", "الحالة"], statLabels: [["إجمالي المبيعات", "ج.م", "primary", "wallet"], ["عدد الفواتير", "", "info", "file"], ["متوسط قيمة الفاتورة", "ج.م", "warning", "calculator"], ["صافي المبيعات", "ج.م", "success", "chart"]] }),
  profits: reportDefinition({ label: "الأرباح", title: "تقرير الأرباح", subtitle: "نظرة شاملة على الأداء المالي والربحية", tableTitle: "أحدث المعاملات المؤثرة على الأرباح", search: "بحث في المعاملات...", columns: ["رقم المرجع", "التاريخ", "النوع", "الفئة", "المبلغ (الإيراد)", "التكلفة", "صافي الربح"], statLabels: [["إجمالي المبيعات", "ج.م", "success", "wallet"], ["تكلفة البضاعة", "ج.م", "info", "box"], ["إجمالي المصروفات", "ج.م", "danger", "receipt"], ["صافي الربح", "ج.م", "success", "chart"]] }),
  products: reportDefinition({ label: "المنتجات", title: "تقرير المنتجات", subtitle: "تحليل أداء المنتجات وحركة المبيعات والربحية", tableTitle: "تفاصيل أداء المنتجات", search: "بحث باسم المنتج أو SKU...", columns: ["المنتج", "رمز SKU", "الفئة", "الكمية المباعة", "الإيرادات", "التكلفة", "صافي الربح", "الحالة"], statLabels: [["إجمالي المنتجات", "", "primary", "box"], ["المنتجات المباعة", "", "success", "cart"], ["متوسط هامش الربح", "%", "info", "chart"], ["منتجات بدون حركة", "", "warning", "alert"]] }),
  customers: reportDefinition({ label: "العملاء", title: "تقرير العملاء", subtitle: "تحليل قاعدة العملاء والمشتريات والمديونيات", tableTitle: "تفاصيل العملاء", search: "بحث باسم العميل أو الهاتف...", columns: ["اسم العميل", "رقم الهاتف", "إجمالي الفواتير", "إجمالي المشتريات", "الديون الحالية", "تاريخ آخر شراء", "النوع"], statLabels: [["إجمالي العملاء", "", "primary", "users"], ["العملاء النشطون", "", "success", "badge"], ["متوسط قيمة الطلب", "ج.م", "info", "cart"], ["إجمالي ديون العملاء", "ج.م", "danger", "wallet"]] }),
  suppliers: reportDefinition({ label: "الموردين", title: "تقرير الموردين", subtitle: "نظرة عامة على أداء الموردين والالتزامات المالية", tableTitle: "تفاصيل الموردين", search: "بحث باسم المورد...", columns: ["اسم المورد", "عدد الفواتير", "إجمالي المشتريات", "إجمالي المدفوع", "الرصيد المتبقي"], statLabels: [["إجمالي الموردين", "", "primary", "users"], ["إجمالي المشتريات", "ج.م", "warning", "cart"], ["إجمالي المدفوع", "ج.م", "success", "wallet"], ["الرصيد المتبقي", "ج.م", "warning", "receipt"]] }),
  inventory: reportDefinition({ label: "المخزون", title: "تقرير المخزون", subtitle: "نظرة عامة على حالة المخزون وقيمته الحالية", tableTitle: "تفاصيل المنتجات", search: "بحث برمز SKU...", columns: ["المنتج / رمز SKU", "الفئة", "الكمية", "سعر الشراء", "قيمة المخزون", "الحالة"], statLabels: [["إجمالي قيمة المخزون", "ج.م", "success", "wallet"], ["عدد المنتجات", "", "info", "box"], ["منتجات منخفضة المخزون", "", "warning", "alert"], ["منتجات نفد مخزونها", "", "danger", "alert"]] }),
  debts: reportDefinition({ label: "المديونيات", title: "تقرير المديونيات", subtitle: "متابعة مديونيات العملاء والتحصيلات", tableTitle: "تفاصيل مديونيات العملاء", search: "بحث باسم العميل...", columns: ["اسم العميل", "رقم الهاتف", "الفواتير", "إجمالي الدين", "المسدد", "المتبقي", "الحالة"], statLabels: [["إجمالي المديونيات", "ج.م", "primary", "wallet"], ["عدد العملاء المدينين", "عميل", "info", "users"], ["إجمالي التحصيل", "ج.م", "success", "receipt"], ["المتبقي للتحصيل", "ج.م", "primary", "calendar"]] }),
  expenses: reportDefinition({ label: "المصروفات", title: "التقارير - تقرير المصروفات", subtitle: "نظرة عامة على المصروفات والأداء المالي", tableTitle: "تفاصيل المصروفات", search: "بحث في التفاصيل...", columns: ["التاريخ", "الوصف / البيان", "التصنيف", "المستخدم", "المبلغ"], statLabels: [["إجمالي المصروفات", "ج.م", "primary", "wallet"], ["مصروفات هذا الشهر", "ج.م", "warning", "calendar"], ["متوسط المصروف اليومي", "ج.م", "success", "chart"]] }),
  returns: reportDefinition({ label: "المرتجعات والاستبدالات", title: "التقارير - تقرير المرتجعات والاستبدالات", subtitle: "نظرة عامة على حركات المرتجعات والاستبدالات وتأثيرها المالي", tableTitle: "سجل الحركات", search: "بحث برقم الحركة أو الفاتورة...", columns: ["رقم الحركة", "النوع", "الفاتورة الأصلية", "الفاتورة الجديدة", "التاريخ", "طريقة التسوية", "السبب / فرق السعر", "القيمة"], statLabels: [["عدد المرتجعات", "", "danger", "receipt"], ["قيمة المرتجعات", "ج.م", "danger", "wallet"], ["عدد الاستبدالات", "", "warning", "swap"], ["إجمالي فروق الاستبدال", "ج.م", "primary", "chart"]] })
};

const REPORT_ENDPOINTS = { profits: "overview", customers: "debts", suppliers: "purchases", inventory: "inventory-revaluations", returns: "returns-exchanges" };
REPORTS.discounts = { ...REPORTS.expenses, label: "الخصومات", title: "تقرير الخصومات", subtitle: "تفاصيل الخصومات المطبقة خلال الفترة المحددة", tableTitle: "تفاصيل الخصومات", search: "بحث في الخصومات..." };
REPORTS.commissions = { ...REPORTS.expenses, label: "العمولات", title: "تقرير العمولات", subtitle: "تفاصيل عمولات موظفي المبيعات خلال الفترة المحددة", tableTitle: "تفاصيل العمولات", search: "بحث في العمولات..." };

// Report definitions carry presentation metadata only. No sample values may reach the UI.
Object.values(REPORTS).forEach(report => {
  report.rows = [];
  report.total = "0";
  report.chart = null;
  report.sideRows = null;
  report.donut = false;
  report.stats = report.stats.map(([label, , unit, tone, , iconName]) => [label, "0", unit, tone, "", iconName]);
});
const PERIOD_LABELS = { today: "اليوم", yesterday: "أمس", this_week: "هذا الأسبوع", this_month: "هذا الشهر", last_30_days: "آخر 30 يومًا", custom: "فترة مخصصة" };
const FIELD_LABELS = {
  id: "المعرّف", invoice_number: "رقم الفاتورة", reference_number: "رقم المرجع", created_at: "التاريخ", date: "التاريخ",
  name: "الاسم", name_ar: "الاسم", product_name: "المنتج", customer_name: "العميل", supplier_name: "المورد",
  cashier_name: "الكاشير", sales_person_name: "موظف المبيعات", category_name: "الفئة", sku: "SKU", status: "الحالة",
  quantity: "الكمية", qty: "الكمية", invoice_count: "عدد الفواتير", total: "الإجمالي", total_amount: "الإجمالي",
  sales: "المبيعات", total_sales: "إجمالي المبيعات", net_sales: "صافي المبيعات", paid_amount: "المدفوع",
  remaining_amount: "المتبقي", discount_amount: "الخصم", discount_percent: "نسبة الخصم", cost: "التكلفة", total_cost: "إجمالي التكلفة",
  profit: "الربح", gross_profit: "إجمالي الربح", net_profit: "صافي الربح", profit_margin: "هامش الربح", amount: "المبلغ",
  payment_method: "طريقة الدفع", payment_status: "حالة الدفع", phone: "رقم الهاتف", customer_phone: "هاتف العميل",
  purchase_price: "سعر الشراء", sale_price: "سعر البيع", unit_price: "سعر الوحدة", stock_qty: "كمية المخزون",
  stock_quantity: "كمية المخزون", opening_stock: "رصيد أول المدة", closing_stock: "رصيد آخر المدة", inventory_value: "قيمة المخزون",
  sold_quantity: "الكمية المباعة", returned_quantity: "الكمية المرتجعة", return_amount: "قيمة المرتجع", reason: "السبب",
  expense_type: "نوع المصروف", expense_type_name: "نوع المصروف", commission_rate: "نسبة العمولة", commission_amount: "قيمة العمولة",
  user_name: "المستخدم", username: "اسم المستخدم", cashier: "الكاشير", sales_person: "موظف المبيعات",
  category: "الفئة", product: "المنتج", supplier: "المورد", customer: "العميل", notes: "ملاحظات",
  updated_at: "آخر تحديث", due_date: "تاريخ الاستحقاق", opened_at: "وقت فتح الوردية", closed_at: "وقت إغلاق الوردية"
};
const SUMMARY_LABELS = { ...FIELD_LABELS, total_items: "عدد النتائج", total_products: "عدد المنتجات", total_expenses: "إجمالي المصروفات", total_debts: "إجمالي المديونيات", total_purchases: "إجمالي المشتريات", net_profit: "صافي الربح", return_count: "عدد المرتجعات", return_total: "قيمة المرتجعات", exchange_count: "عدد الاستبدالات", exchange_difference_total: "إجمالي فروق الاستبدال", total_discounts: "إجمالي الخصومات", total_commissions: "إجمالي العمولات", total_paid: "إجمالي المدفوع", total_remaining: "إجمالي المتبقي", out_of_stock_count: "منتجات نفدت", low_stock_count: "مخزون منخفض", gross_profit: "إجمالي الربح", net_sales: "صافي المبيعات" };
const FIELD_WORDS = {
  total: "إجمالي", net: "صافي", gross: "إجمالي", count: "العدد", number: "رقم", name: "الاسم", date: "التاريخ", time: "الوقت",
  amount: "المبلغ", price: "السعر", cost: "التكلفة", quantity: "الكمية", qty: "الكمية", status: "الحالة", type: "النوع",
  invoice: "الفاتورة", product: "المنتج", customer: "العميل", supplier: "المورد", cashier: "الكاشير", sales: "المبيعات",
  payment: "الدفع", paid: "المدفوع", remaining: "المتبقي", discount: "الخصم", profit: "الربح", commission: "العمولة",
  purchase: "المشتريات", purchases: "المشتريات", return: "المرتجع", returns: "المرتجعات", expense: "المصروف", expenses: "المصروفات",
  stock: "المخزون", inventory: "المخزون", opening: "الافتتاحي", closing: "الختامي", method: "الطريقة", rate: "النسبة",
  percent: "النسبة", margin: "الهامش", phone: "الهاتف", category: "الفئة", user: "المستخدم", created: "الإنشاء", updated: "التحديث",
  due: "الاستحقاق", reference: "المرجع", reason: "السبب", note: "الملاحظة", notes: "الملاحظات", value: "القيمة"
};

function fieldLabel(field) {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  const translated = String(field).split("_").map(word => FIELD_WORDS[word.toLowerCase()] || "").filter(Boolean).join(" ");
  return translated || "بيانات إضافية";
}

const REPORT_DATA_KEYS = {
  sales: ["sales", "invoices", "sales_invoices", "items"],
  profits: ["transactions", "profit_rows", "entries", "items", "top_products"],
  products: ["products", "product_performance", "top_products", "items"],
  suppliers: ["purchases", "suppliers", "supplier_purchases", "items"],
  inventory: ["revaluations", "inventory_revaluations", "products", "items"],
  debts: ["debts", "debtors", "items"],
  expenses: ["expenses", "items"],
  discounts: ["discounts", "items"],
  commissions: ["commissions", "sales_users", "items"]
};

function getItems(response, reportKey) {
  const direct = listFrom(response);
  if (direct.length) return direct;
  const preferred = REPORT_DATA_KEYS[reportKey] || [];
  for (const key of [...preferred, "rows", "records", "entries", "details", "invoices", "products", "purchases", "debts", "expenses", "discounts", "commissions", "returns", "exchanges", "revaluations"]) {
    const value = response?.[key] || response?.data?.[key];
    if (Array.isArray(value)) return value;
  }
  const nestedArrays = Object.entries(response?.data || {}).filter(([key, value]) => Array.isArray(value) && value.length && typeof value[0] === "object" && !/(series|trend|distribution|breakdown)/i.test(key));
  if (nestedArrays.length) return nestedArrays[0][1];
  return [];
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "object") return value.name || value.name_ar || value.username || value.invoice_number || value.id || "—";
  if (typeof value === "number") return value.toLocaleString("ar-EG", { maximumFractionDigits: 2 });
  if (typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)) return new Date(value).toLocaleString("ar-EG");
  return String(value);
}

function shortDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(new Date(value));
}

function returnsReportFromResponse(base, response) {
  const data = response?.data || response || {};
  const returns = Array.isArray(data.returns) ? data.returns : [];
  const exchanges = Array.isArray(data.exchanges) ? data.exchanges : [];
  const summary = data.summary || response?.summary || {};
  const currency = response?.currency === "EGP" ? "ج.م" : response?.currency || "ج.م";
  const methodLabels = { cash: "نقدي", card: "بطاقة", wallet: "محفظة", transfer: "تحويل", store_credit: "رصيد استبدال", exchange: "استبدال" };
  const rows = [
    ...returns.map(item => [
      item.return_number || item.id || "—",
      { text: item.refund_method === "exchange" ? "مرتجع للاستبدال" : "مرتجع", badge: item.refund_method === "exchange" ? "warning" : "danger" },
      item.original_invoice_id || "—", "—", displayValue(item.created_at), methodLabels[item.refund_method] || item.refund_method || "—",
      item.reason || "—", `${displayValue(Number(item.total_refund || 0))} ${currency}`
    ]),
    ...exchanges.map(item => [
      item.exchange_number || item.id || "—", { text: "استبدال", badge: "warning" }, item.original_invoice_id || "—", item.new_invoice_id || "—",
      displayValue(item.created_at), methodLabels[item.settlement_method] || item.settlement_method || "—",
      `${item.difference_type === "due" ? "مبلغ مستحق" : "مبلغ مسترد"}: ${displayValue(Number(item.difference_amount || 0))} ${currency}`,
      `${displayValue(Number(item.difference_amount || 0))} ${currency}`
    ])
  ].sort((a, b) => String(b[4]).localeCompare(String(a[4]), "ar"));
  const daily = new Map();
  const addDaily = (item, key, value) => {
    const date = String(item.created_at || "").slice(0, 10);
    if (!date) return;
    const point = daily.get(date) || { returns: 0, exchanges: 0 };
    point[key] += Number(value || 0);
    daily.set(date, point);
  };
  returns.forEach(item => addDaily(item, "returns", item.total_refund));
  exchanges.forEach(item => addDaily(item, "exchanges", item.difference_amount));
  const dates = [...daily.keys()].sort();
  return {
    ...base,
    columns: REPORTS.returns.columns,
    rows,
    total: String(returns.length + exchanges.length),
    stats: [
      ["عدد المرتجعات", displayValue(Number(summary.return_count ?? returns.length)), "", "danger", "", "receipt"],
      ["قيمة المرتجعات", displayValue(Number(summary.return_total ?? returns.reduce((sum, item) => sum + Number(item.total_refund || 0), 0))), currency, "danger", "", "wallet"],
      ["عدد الاستبدالات", displayValue(Number(summary.exchange_count ?? exchanges.length)), "", "warning", "", "swap"],
      ["إجمالي فروق الاستبدال", displayValue(Number(summary.exchange_difference_total ?? exchanges.reduce((sum, item) => sum + Number(item.difference_amount || 0), 0))), currency, "primary", "", "chart"]
    ],
    chart: dates.length ? { type: "bars", title: "القيمة اليومية للمرتجعات والاستبدالات", labels: dates.map(shortDate), values: dates.map(date => daily.get(date).returns), compare: dates.map(date => daily.get(date).exchanges), valueLabel: "المرتجعات", compareLabel: "فروق الاستبدال" } : null,
    breakdown: { title: "توزيع الحركات", returns: Number(summary.return_count ?? returns.length), exchanges: Number(summary.exchange_count ?? exchanges.length) }
  };
}

const CHART_VALUE_FIELDS = {
  sales: ["total_amount", "net_total", "sales_amount", "amount", "total"],
  profits: ["net_profit", "gross_profit", "profit", "amount"],
  products: ["sales_amount", "revenue", "net_profit", "sold_quantity", "quantity"],
  suppliers: ["total_amount", "purchase_amount", "total_purchases", "amount"],
  inventory: ["value_difference", "difference_amount", "inventory_value", "total_value", "amount"],
  debts: ["remaining_amount", "total_debt", "amount"],
  expenses: ["amount", "total_amount"], discounts: ["discount_amount", "amount"], commissions: ["commission_amount", "amount"]
};

const REPORT_STAT_FIELDS = {
  sales: [["total_sales", "sales_total", "gross_sales", "total_amount"], ["invoice_count", "sales_count", "total_invoices", "count"], ["average_invoice", "average_order_value", "average_basket", "avg_invoice_value"], ["net_sales", "net_total"]],
  profits: [["total_sales", "sales_total", "net_sales"], ["cost_of_goods_sold", "cogs", "total_cost", "inventory_cost"], ["total_expenses", "expenses_total"], ["net_profit", "profit", "gross_profit"]],
  products: [["total_products", "product_count", "total_product_count"], ["sold_products", "products_sold", "sold_product_count"], ["average_profit_margin", "avg_profit_margin", "profit_margin"], ["inactive_products", "products_without_sales", "no_movement_count"]],
  customers: [["total_customers", "customer_count"], ["active_customers", "active_customer_count"], ["average_order_value", "average_basket"], ["total_debts", "debts_total", "total_remaining"]],
  suppliers: [["total_suppliers", "supplier_count"], ["total_purchases", "purchases_total", "total_amount"], ["total_paid", "paid_amount"], ["total_remaining", "remaining_amount", "total_payables"]],
  inventory: [["inventory_value", "total_inventory_value", "total_stock_value", "value_difference"], ["total_products", "product_count", "total_items"], ["low_stock_count", "low_stock_products"], ["out_of_stock_count", "out_of_stock_products"]],
  debts: [["total_debts", "debts_total", "total_amount"], ["debtor_count", "customers_count", "total_customers"], ["total_paid", "paid_amount", "collected_amount"], ["total_remaining", "remaining_amount"]],
  expenses: [["total_expenses", "expenses_total", "total_amount"], ["month_expenses", "this_month_expenses", "monthly_total"], ["average_daily_expense", "daily_average", "avg_daily_expense"]],
  discounts: [["total_discounts", "discounts_total", "total_amount"], ["month_discounts", "this_month_discounts", "monthly_total"], ["average_discount", "daily_average", "avg_discount"]],
  commissions: [["total_commissions", "commissions_total", "total_amount"], ["month_commissions", "this_month_commissions", "monthly_total"], ["average_commission", "daily_average", "avg_commission"]]
};

function firstFinite(item, fields) {
  for (const field of fields) {
    const value = Number(item?.[field]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeChart(rawChart, fallbackTitle) {
  if (!rawChart) return null;
  const rawValues = rawChart.values || rawChart.data || rawChart.series;
  if (!Array.isArray(rawValues) || !rawValues.length) return null;
  if (typeof rawValues[0] === "object") {
    const values = rawValues.map(item => firstFinite(item, ["amount", "value", "total", "sales", "total_sales", "net_sales", "net_profit", "gross_profit", "profit", "revenue", "cost", "quantity", "count"]));
    const labels = rawValues.map((item, index) => { const date = item.date || item.day || item.period || item.created_at; return date ? shortDate(date) : item.label || item.name || String(index + 1); });
    return { type: rawChart.type === "bars" || rawChart.type === "bar" ? "bars" : "line", title: rawChart.title || fallbackTitle, labels, values, compare: [] };
  }
  return { type: rawChart.type === "bars" || rawChart.type === "bar" ? "bars" : "line", title: rawChart.title || fallbackTitle, labels: rawChart.labels || rawChart.periods || rawValues.map((_, index) => String(index + 1)), values: rawValues.map(Number), compare: (rawChart.compare || rawChart.previous || []).map(Number) };
}

function derivedChart(response, items, reportKey) {
  const data = response?.data || response || {};
  const explicit = response?.chart || response?.trend || response?.timeline || data.chart || data.trend || data.timeline;
  const normalized = normalizeChart(explicit, "حركة التقرير خلال الفترة");
  if (normalized) return normalized;
  const seriesSources = { ...response, ...data };
  const seriesEntry = Object.entries(seriesSources).find(([key, value]) => /(series|trend|timeline|daily|monthly|weekly)$/i.test(key) && Array.isArray(value) && value.length);
  if (seriesEntry) {
    const chart = normalizeChart({ series: seriesEntry[1], title: "الحركة خلال الفترة" }, "الحركة خلال الفترة");
    if (chart) return chart;
  }
  if (!items.length) return null;
  const fields = CHART_VALUE_FIELDS[reportKey] || ["amount", "total_amount", "total", "value", "count"];
  const dated = items.filter(item => item.created_at || item.date || item.day || item.occurred_at || item.invoice_date);
  if (dated.length) {
    const daily = new Map();
    dated.forEach(item => {
      const rawDate = item.created_at || item.date || item.day || item.occurred_at || item.invoice_date;
      const date = String(rawDate).slice(0, 10);
      daily.set(date, (daily.get(date) || 0) + firstFinite(item, fields));
    });
    const dates = [...daily.keys()].sort();
    return { type: "line", title: "الحركة اليومية خلال الفترة", labels: dates.map(shortDate), values: dates.map(date => daily.get(date)), compare: [] };
  }
  const named = items.filter(item => item.name || item.name_ar || item.product_name || item.supplier_name || item.customer_name || item.user_name || item.category_name || item.expense_type_name || item.description).slice(0, 10);
  if (named.length) return { type: "bars", title: "مقارنة أعلى النتائج", labels: named.map(item => item.name || item.name_ar || item.product_name || item.supplier_name || item.customer_name || item.user_name || item.category_name || item.expense_type_name || item.description), values: named.map(item => firstFinite(item, fields)), compare: [] };
  return null;
}

function collectSummary(response) {
  const data = response?.data || {};
  const scalarData = Object.fromEntries(Object.entries(data).filter(([, value]) => ["string", "number"].includes(typeof value)));
  const scalarRoot = Object.fromEntries(Object.entries(response || {}).filter(([, value]) => ["string", "number"].includes(typeof value)));
  return {
    ...scalarRoot,
    ...scalarData,
    ...(response?.totals || {}),
    ...(response?.kpis || {}),
    ...(response?.summary || {}),
    ...(data?.totals || {}),
    ...(data?.kpis || {}),
    ...(data?.summary || {})
  };
}

function statValue(summary, candidates) {
  const key = candidates.find(candidate => summary[candidate] !== undefined && summary[candidate] !== null);
  return key ? summary[key] : 0;
}

function reportFromResponse(base, response, reportKey) {
  const items = getItems(response, reportKey);
  const keys = items.length ? Object.keys(items[0]).filter(field => field !== "id" && !field.endsWith("_id") && !Array.isArray(items[0][field])).slice(0, 9) : [];
  const summary = collectSummary(response);
  const summaryEntries = Object.entries(summary).filter(([, value]) => ["string", "number"].includes(typeof value)).slice(0, 4);
  const chart = derivedChart(response, items, reportKey);
  const currency = response?.currency || response?.data?.currency || "EGP";
  const unitFor = key => /(count|quantity|products|suppliers|customers|invoices|items)$/i.test(key) ? "" : /(percent|percentage|rate|margin)$/i.test(key) ? "%" : currency === "EGP" ? "ج.م" : currency;
  return {
    ...base,
    chart,
    donut: false,
    sideRows: null,
    columns: items.length ? keys.map(fieldLabel) : base.columns,
    rows: items.map(item => keys.map(key => displayValue(item[key]))),
    total: String(response?.total ?? response?.pagination?.total ?? response?.data?.total ?? response?.data?.pagination?.total ?? items.length),
    stats: REPORT_STAT_FIELDS[reportKey]
      ? base.stats.map((stat, index) => [stat[0], displayValue(statValue(summary, REPORT_STAT_FIELDS[reportKey][index] || [])), stat[2], stat[3], "", stat[5]])
      : summaryEntries.length
        ? summaryEntries.map(([key, value], index) => [SUMMARY_LABELS[key] || fieldLabel(key), displayValue(value), unitFor(key), ["primary", "success", "info", "warning"][index], "", "chart"])
        : base.stats.map(stat => [stat[0], "0", stat[2], stat[3], "", stat[5]])
  };
}

const ICON_PATHS = {
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 10h5v5h-5a2.5 2.5 0 0 1 0-5Z"/>', file: '<path d="M6 3h9l3 3v15H6zM9 10h6M9 14h6"/>', calculator: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>', chart: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>', box: '<path d="m4 7 8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10"/>', receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6"/>', cart: '<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2 11h11l2-8H6"/>', alert: '<path d="M12 3 2 21h20L12 3Zm0 6v5m0 3h.01"/>', users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.8"/>', badge: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>', calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>', swap: '<path d="m7 7-4 4 4 4M3 11h14M17 17l4-4-4-4M21 13H7"/>'
};

function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.chart}</svg>`; }
function renderCell(cell) {
  if (cell && typeof cell === "object") {
    if (cell.badge) return `<span class="reports-badge${cell.badge === "success" ? "" : ` reports-badge--${escapeHtml(cell.badge)}`}">${escapeHtml(cell.text)}</span>`;
    return `<span class="${escapeHtml(cell.className || "")}">${escapeHtml(cell.text)}</span>`;
  }
  return escapeHtml(cell);
}

function renderStats(stats) {
  return `<section class="reports-stat-grid${stats.length === 3 ? " reports-stat-grid--3" : ""}">${stats.map(([label, value, unit, tone, delta, iconName]) => `<article class="reports-stat reports-stat--${tone}"><div class="reports-stat__head"><span class="reports-stat__label">${escapeHtml(label)}</span><i class="reports-stat__icon">${icon(iconName)}</i></div><strong class="reports-stat__value num">${escapeHtml(value)}${unit ? `<small>${escapeHtml(unit)}</small>` : ""}</strong><span class="reports-stat__delta">${escapeHtml(delta)}</span></article>`).join("")}</section>`;
}

function renderLineChart(chart) {
  const width = 760, height = 270, pad = 34;
  const all = [...chart.values, ...(chart.compare || [])]; const max = Math.max(...all, 1); const count = Math.max(chart.values.length - 1, 1);
  const points = (values) => values.map((value, index) => `${pad + (index * ((width - pad * 2) / count))},${height - pad - ((value / max) * (height - pad * 2))}`).join(" ");
  const grid = [0, 1, 2, 3, 4].map((_, index) => { const y = pad + (index * ((height - pad * 2) / 4)); return `<line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="var(--color-border)"/>`; }).join("");
  const labels = chart.labels.map((label, index) => `<text x="${pad + (index * ((width - pad * 2) / count))}" y="${height - 7}" text-anchor="middle" fill="var(--color-text-muted)" font-size="9">${escapeHtml(label)}</text>`).join("");
  const comparison = chart.compare?.length ? `<polyline points="${points(chart.compare)}" fill="none" stroke="color-mix(in srgb, var(--color-primary) 25%, var(--color-text-faint))" stroke-width="3"/>` : "";
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(chart.title)}">${grid}${comparison}<polyline points="${points(chart.values)}" fill="none" stroke="var(--color-primary)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${labels}</svg>`;
}

function renderBars(chart) {
  const compare = Array.isArray(chart.compare) ? chart.compare : [];
  const width = 760, height = 270, pad = 38, max = Math.max(...chart.values, ...compare, 1), group = (width - pad * 2) / chart.values.length;
  const grid = [0, 1, 2, 3].map((_, index) => { const y = pad + index * ((height - pad * 2) / 3); return `<line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="var(--color-border)"/>`; }).join("");
  const bars = chart.values.map((value, index) => { const h1 = value / max * (height - pad * 2), h2 = (compare[index] || 0) / max * (height - pad * 2), x = pad + index * group; return `<rect x="${x + group * .18}" y="${height - pad - h2}" width="${group * .26}" height="${h2}" rx="3" fill="var(--color-surface-hover)"/><rect x="${x + group * .48}" y="${height - pad - h1}" width="${group * .26}" height="${h1}" rx="3" fill="var(--color-primary)"/><text x="${x + group * .5}" y="${height - 8}" text-anchor="middle" fill="var(--color-text-muted)" font-size="10">${escapeHtml(chart.labels[index])}</text>`; }).join("");
  return `<div class="reports-chart-with-legend"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(chart.title)}">${grid}${bars}</svg>${chart.compareLabel ? `<div class="reports-chart-legend"><span><i class="is-primary"></i>${escapeHtml(chart.valueLabel || "القيمة")}</span><span><i></i>${escapeHtml(chart.compareLabel)}</span></div>` : ""}</div>`;
}

function renderBreakdown(breakdown) {
  const returns = Math.max(0, Number(breakdown.returns || 0));
  const exchanges = Math.max(0, Number(breakdown.exchanges || 0));
  const total = Math.max(returns + exchanges, 1);
  const returnPercent = returns / total * 100;
  return `<article class="reports-side-card reports-movement-breakdown"><h3>${escapeHtml(breakdown.title)}</h3><div class="reports-donut"><svg viewBox="0 0 120 120" role="img" aria-label="${returns} مرتجع و${exchanges} استبدال"><g transform="rotate(-90 60 60)"><circle cx="60" cy="60" r="44" fill="none" stroke="var(--color-surface-hover)" stroke-width="14"/><circle cx="60" cy="60" r="44" pathLength="100" fill="none" stroke="var(--color-danger)" stroke-width="14" stroke-dasharray="${returnPercent} ${100 - returnPercent}"/><circle cx="60" cy="60" r="44" pathLength="100" fill="none" stroke="var(--color-warning)" stroke-width="14" stroke-dasharray="${100 - returnPercent} ${returnPercent}" stroke-dashoffset="-${returnPercent}"/></g><text x="60" y="57" text-anchor="middle" fill="var(--color-text-muted)" font-size="8">إجمالي الحركات</text><text x="60" y="72" text-anchor="middle" fill="var(--color-text)" font-size="16" font-weight="700">${returns + exchanges}</text></svg></div><div class="reports-legend"><span class="is-danger"><i></i><b>المرتجعات</b><strong>${returns}</strong></span><span class="is-warning"><i></i><b>الاستبدالات</b><strong>${exchanges}</strong></span></div></article>`;
}

function renderDonut() {
  return `<article class="reports-side-card reports-debts-analysis"><h3>تحليل حالة المديونيات</h3><div class="reports-donut"><svg viewBox="0 0 120 120" role="img" aria-label="إجمالي المديونيات 125 ألف"><g transform="rotate(-90 60 60)"><circle cx="60" cy="60" r="44" fill="none" stroke="var(--color-surface-hover)" stroke-width="14"/><circle cx="60" cy="60" r="44" pathLength="100" fill="none" stroke="var(--color-success)" stroke-width="14" stroke-dasharray="40 60"/><circle cx="60" cy="60" r="44" pathLength="100" fill="none" stroke="var(--color-warning)" stroke-width="14" stroke-dasharray="25 75" stroke-dashoffset="-40"/></g><text x="60" y="57" text-anchor="middle" fill="var(--color-text-muted)" font-size="8">الإجمالي</text><text x="60" y="70" text-anchor="middle" fill="var(--color-text)" font-size="15" font-weight="700">125K</text></svg></div><div class="reports-legend"><span class="is-danger"><i></i><b>غير مسدد</b><strong>43,750 ر.س</strong></span><span class="is-warning"><i></i><b>مدفوع جزئيًا</b><strong>31,350 ر.س</strong></span><span class="is-success"><i></i><b>مسدد (تاريخيًا)</b><strong>50,300 ر.س</strong></span></div></article>`;
}

function renderVisual(report) {
  if (report.donut) return renderDonut();
  if (!report.chart) return `<section class="reports-chart-layout reports-chart-layout--single"><article class="reports-chart-card"><h3>الرسم البياني</h3><div class="reports-chart reports-chart--empty"><div class="empty-state"><h3>لا توجد نقاط للرسم</h3><p>لم يُرجع الـAPI بيانات زمنية أو قيمًا قابلة للرسم ضمن الفترة المحددة.</p></div></div></article></section>`;
  const chart = report.chart.type === "bars" ? renderBars(report.chart) : renderLineChart(report.chart);
  const side = report.breakdown ? renderBreakdown(report.breakdown) : report.sideRows ? `<article class="reports-side-card"><h3>تفصيل الأرباح حسب الفئة</h3>${report.sideRows.map(([label, value, percent]) => `<div class="reports-side-row"><div class="reports-side-row__head"><b>${escapeHtml(label)}</b><strong>${escapeHtml(value)}</strong></div><div class="reports-progress"><i style="width:${Number(percent)}%"></i></div><span>هامش الربح: ${Number(percent)}%</span></div>`).join("")}</article>` : "";
  return `<section class="reports-chart-layout${side ? "" : " reports-chart-layout--single"}"><article class="reports-chart-card"><h3>${escapeHtml(report.chart.title)}</h3><div class="reports-chart">${chart}</div></article>${side}</section>`;
}

function renderTable(report) {
  const page = Number(report.page || 1), pages = Math.max(1, Math.ceil(Number(report.total || 0) / Number(report.pageSize || 20)));
  return `<section class="reports-table-card"><header class="reports-table-head"><h3>${escapeHtml(report.tableTitle)}</h3><label class="reports-search"><input id="reportsSearch" type="search" placeholder="${escapeHtml(report.search)}" autocomplete="off"/>${icon("chart")}</label></header><div class="table-responsive reports-table-wrap"><table class="data-table reports-table"><thead><tr>${report.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody id="reportsTableBody">${report.rows.map((row) => `<tr data-search="${escapeHtml(row.map((cell) => typeof cell === "object" ? cell.text : cell).join(" ").toLowerCase())}">${row.map((cell) => `<td>${renderCell(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table><div class="empty-state reports-empty" id="reportsEmpty"${report.rows.length ? " hidden" : ""}><h3>لا توجد بيانات</h3><p>لا توجد نتائج ضمن الفترة المحددة.</p></div></div><footer class="reports-table-footer"><span>صفحة ${page} من ${pages} — ${escapeHtml(report.total)} نتيجة</span><div class="reports-pages"><button type="button" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹</button><button class="is-active" type="button">${page}</button><button type="button" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>›</button></div></footer></section>`;
}

function renderReport(reportKey) {
  const report = REPORTS[reportKey] || REPORTS.sales;
  const details = `${renderVisual(report)}${renderTable(report)}`;
  return `<header class="reports-section-header"><div><h2>${escapeHtml(report.title)}</h2><p>${escapeHtml(report.subtitle)}</p></div><div class="reports-actions"><button class="btn btn-outline" id="reportsPrint" type="button">${icon("file")}طباعة</button><button class="btn btn-primary" id="reportsExport" type="button">${icon("receipt")}تصدير</button></div></header><section class="reports-filter-bar"><label class="reports-control">${icon("calendar")}<select id="reportsPeriod">${Object.entries(PERIOD_LABELS).map(([value, label]) => `<option value="${value}"${value === report.period ? " selected" : ""}>${label}</option>`).join("")}</select></label><label class="reports-control reports-date"${report.period === "custom" ? "" : " hidden"}>من<input id="reportsFromDate" type="date" value="${escapeHtml(report.fromDate || "")}" /></label><label class="reports-control reports-date"${report.period === "custom" ? "" : " hidden"}>إلى<input id="reportsToDate" type="date" value="${escapeHtml(report.toDate || "")}" /></label><button class="btn btn-outline reports-filter-apply" id="reportsApply" type="button">تطبيق الفلاتر</button></section>${renderStats(report.stats)}${details}`;
}

function downloadCsv(report) {
  const rows = [report.columns, ...report.rows.map((row) => row.map((cell) => typeof cell === "object" ? cell.text : cell))];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = `${report.label}.csv`; link.click(); URL.revokeObjectURL(url);
}

function bindReportInteractions(reportKey, cleanup, reload) {
  const report = REPORTS[reportKey]; const search = document.getElementById("reportsSearch"); const body = document.getElementById("reportsTableBody"); const empty = document.getElementById("reportsEmpty");
  document.getElementById("reportsPrint").lastChild.textContent = "تصدير PDF";
  document.getElementById("reportsExport").lastChild.textContent = "تصدير Excel";
  const filter = debounce(() => { const term = search.value.trim().toLowerCase(); let visible = 0; body.querySelectorAll("tr").forEach((row) => { const show = row.dataset.search.includes(term); row.hidden = !show; if (show) visible += 1; }); empty.hidden = visible > 0; body.hidden = visible === 0; }, 300);
  const reportTable = document.querySelector(".reports-table");
  const exportReport = () => window.GhaithPrint?.exportTableExcel({ title: report.title, table: reportTable, fileName: `ghaith-${reportKey}` });
  const printReport = () => window.GhaithPrint?.exportTablePdf({ title: report.title, subtitle: report.subtitle, table: reportTable, summary: report.stats.map(([label,value,unit]) => ({ label, value: `${value} ${unit}`.trim() })), fileName: `ghaith-${reportKey}` });
  const applyFilters = () => {
    const period = document.getElementById("reportsPeriod").value;
    const fromDate = document.getElementById("reportsFromDate")?.value || "";
    const toDate = document.getElementById("reportsToDate")?.value || "";
    if (period === "custom" && (!fromDate || !toDate)) { showToast("حدد تاريخ البداية والنهاية", true); return; }
    if (period === "custom" && fromDate > toDate) { showToast("تاريخ البداية يجب أن يسبق تاريخ النهاية", true); return; }
    reload({ period, fromDate, toDate, page: 1 });
  };
  const periodChanged = event => document.querySelectorAll(".reports-date").forEach(field => { field.hidden = event.target.value !== "custom"; });
  search.addEventListener("input", filter); document.getElementById("reportsExport").addEventListener("click", exportReport); document.getElementById("reportsPrint").addEventListener("click", printReport); document.getElementById("reportsApply").addEventListener("click", applyFilters); document.getElementById("reportsPeriod").addEventListener("change", periodChanged);
  cleanup.push(() => { search.removeEventListener("input", filter); document.getElementById("reportsExport")?.removeEventListener("click", exportReport); document.getElementById("reportsPrint")?.removeEventListener("click", printReport); document.getElementById("reportsApply")?.removeEventListener("click", applyFilters); document.getElementById("reportsPeriod")?.removeEventListener("change", periodChanged); });
}

function showToast(message, isError = false) {
  const stack = document.getElementById("reportsToastStack"); if (!stack) return; const toast = document.createElement("div"); toast.className = `toast toast--${isError ? "error" : "success"}`; toast.textContent = message; stack.append(toast); window.setTimeout(() => toast.remove(), 2400);
}

export function initReports() {
  const tabs = document.getElementById("reportsTabs"); const view = document.getElementById("reportsView"); const cleanups = [];
  if (!tabs || !view) throw new Error("reports-view-elements-missing");
  window.bindAdminThemeToggle?.(document.getElementById("reportsThemeToggle"));
  let active = "sales", requestId = 0;
  const filters = Object.fromEntries(Object.keys(REPORTS).map(key => [key, { period: "this_month", fromDate: "", toDate: "", page: 1, pageSize: 20 }]));
  const load = async (key, changes = {}) => {
    active = Object.hasOwn(REPORTS, key) ? key : "sales"; const current = ++requestId;
    filters[active] = { ...filters[active], ...changes };
    const state = filters[active];
    while (cleanups.length) cleanups.pop()(); tabs.querySelectorAll("button").forEach(button => button.classList.toggle("is-active", button.dataset.report === active));
    view.innerHTML = '<div class="view-loading"><span class="spinner"></span><span>جاري تحميل التقرير...</span></div>';
    try {
      const response = await api.get(`/api/v1/admin/reports/${REPORT_ENDPOINTS[active] || active}`, { query: { period: state.period, group_by: "day", from_date: state.period === "custom" ? state.fromDate : undefined, to_date: state.period === "custom" ? state.toDate : undefined, page: state.page, page_size: state.pageSize } });
      if (current !== requestId) return;
      const returnsData = response?.data || response;
      const hasReturnsShape = active === "returns" && (Array.isArray(returnsData?.returns) || Array.isArray(returnsData?.exchanges));
      REPORTS[active] = hasReturnsShape ? returnsReportFromResponse(REPORTS[active], response) : reportFromResponse(REPORTS[active], response, active);
      Object.assign(REPORTS[active], state);
      view.innerHTML = renderReport(active); bindReportInteractions(active, cleanups, changes => load(active, changes));
    } catch (error) { if (current === requestId) view.innerHTML = `<section class="admin-view__error"><h2>تعذّر تحميل التقرير</h2><p>${escapeHtml(error.message)}</p></section>`; }
  };
  const onTabClick = (event) => { const button = event.target.closest("[data-report]"); if (button) load(button.dataset.report); };
  const onPageClick = (event) => { const button = event.target.closest("[data-page]"); if (!button || button.disabled) return; load(active, { page: Number(button.dataset.page) }); };
  const onData = (event) => { const { report, data } = event.detail || {}; if (report && data && REPORTS[report]) { REPORTS[report] = { ...REPORTS[report], ...data }; if (active === report) load(active); } };
  tabs.addEventListener("click", onTabClick); view.addEventListener("click", onPageClick); document.addEventListener("ghaith:reports-data", onData); load(active);
  return () => { requestId++; while (cleanups.length) cleanups.pop()(); tabs.removeEventListener("click", onTabClick); view.removeEventListener("click", onPageClick); document.removeEventListener("ghaith:reports-data", onData); };
}
