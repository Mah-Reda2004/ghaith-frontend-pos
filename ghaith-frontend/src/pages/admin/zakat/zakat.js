import { api, idempotencyKey, listFrom } from "../../../core/api.js";
import { debounce, escapeHtml, formatMoney } from "../../../core/utils.js";

const money = formatMoney;
const valueOf = (source, ...keys) => keys.map(key => source?.[key]).find(value => value !== undefined && value !== null);
const friendlyError = error => {
  const message = String(error?.message || error || "حدث خطأ غير متوقع.");
  if (/Cannot enter the annual gold price before the hawl is complete/i.test(message)) return "لا يمكن إدخال سعر الذهب السنوي قبل اكتمال الحول لهذه الدورة.";
  if (/hawl.*not.*complete|before the hawl/i.test(message)) return "لم يكتمل الحول لهذه الدورة بعد، لذلك لا يمكن تنفيذ هذا الإجراء الآن.";
  return message;
};

export function initZakat() {
  const elements = {
    body: document.getElementById("zakatTableBody"), empty: document.getElementById("zakatEmpty"), info: document.getElementById("zakatInfo"), search: document.getElementById("zakatSearch"),
    eligible: document.getElementById("zakatEligibleValue"), rate: document.getElementById("zakatRate"), due: document.getElementById("zakatDueValue"), stale: document.getElementById("zakatStaleCount"),
    cycle: document.getElementById("zakatCycleLabel"), gold: document.getElementById("zakatGoldPrice"), feedback: document.getElementById("zakatFeedback"), save: document.getElementById("zakatSaveSettings"), calculate: document.getElementById("zakatCalculate"), report: document.getElementById("zakatOpenReport"), reminders: document.getElementById("zakatReminders")
  };
  let disposed = false, rows = [], cycleId = "";

  const feedback = (message, error = false) => { elements.feedback.textContent = message; elements.feedback.classList.toggle("is-error", error); };
  const normalizeRows = response => {
    const nested = response?.inventory || response?.data?.inventory || response?.data?.items;
    return listFrom(nested || response);
  };
  const renderRows = query => {
    const visible = rows.filter(item => !query || [item.product_name, item.name, item.sku, item.category_name, item.category?.name].some(value => String(value || "").toLowerCase().includes(query)));
    elements.body.innerHTML = visible.map(item => {
      const quantity = Number(valueOf(item, "quantity", "stock_qty", "qty") || 0), unitCost = Number(valueOf(item, "unit_cost", "cost_price", "purchase_price") || 0), total = Number(valueOf(item, "total_value", "inventory_value") ?? quantity * unitCost), days = Number(valueOf(item, "days_in_stock", "age_days") || 0), due = Number(valueOf(item, "zakat_due", "zakat_amount") ?? total * 0.025);
      return `<tr><td><strong>${escapeHtml(item.product_name || item.name || item.sku || "—")}</strong></td><td><span class="zakat-category">${escapeHtml(item.category_name || item.category?.name || "—")}</span></td><td>${quantity}</td><td>${money(unitCost)}</td><td>${escapeHtml(String(item.arrival_date || item.received_at || item.created_at || "—").slice(0, 10))}</td><td><span class="zakat-age${days >= 365 ? " is-danger" : days >= 300 ? " is-warning" : ""}">${days}</span></td><td>${money(total)}</td><td><strong class="zakat-due">${money(due)}</strong></td></tr>`;
    }).join("");
    elements.body.hidden = !visible.length; elements.empty.hidden = Boolean(visible.length); elements.empty.querySelector("h3").textContent = rows.length ? "لا توجد أصناف مطابقة" : "لا توجد أصناف خاضعة للزكاة"; elements.empty.querySelector("p").textContent = rows.length ? "جرّب البحث باسم أو فئة أخرى." : "لم يُرجع الخادم مخزونًا مستحقًا لهذه الدورة."; elements.info.textContent = `عرض ${visible.length} من ${rows.length} صنف`;
  };
  const renderSummary = source => {
    const summary = source?.summary || source?.data?.summary || source?.data || source || {};
    const totalValue = Number(valueOf(summary, "eligible_inventory_value", "eligible_value", "inventory_value", "total_inventory_value") || rows.reduce((sum, item) => sum + Number(valueOf(item, "total_value", "inventory_value") || 0), 0));
    const rate = Number(valueOf(summary, "zakat_rate", "rate", "zakat_percent") ?? 2.5), due = Number(valueOf(summary, "zakat_due", "zakat_amount", "total_zakat") ?? totalValue * rate / 100);
    elements.eligible.textContent = `${money(totalValue)} ج.م`; elements.rate.innerHTML = `${rate} <em>%</em>`; elements.due.textContent = `${money(due)} ج.م`; elements.stale.textContent = Number(valueOf(summary, "stale_items_count", "eligible_items_count", "item_count") ?? rows.length).toLocaleString("en-US");
  };
  const load = async () => {
    elements.info.textContent = "جاري تحميل بيانات الزكاة..."; elements.body.hidden = true; elements.empty.hidden = true;
    try {
      const response = await api.get("/api/v1/admin/zakat/inventory"); if (disposed) return;
      const inventory = response?.data || response || {}; rows = normalizeRows(response); cycleId = String(valueOf(inventory, "cycle_id") || inventory.cycle?.id || inventory.settings?.cycle_id || "");
      const cycle = inventory.cycle || {}, hawlComplete = valueOf(inventory, "hawl_completed", "is_hawl_complete") ?? valueOf(cycle, "hawl_completed", "is_hawl_complete"), hawlEnd = valueOf(inventory, "hawl_end_date", "hawl_ends_at") || valueOf(cycle, "hawl_end_date", "ends_at", "end_date"), hawlEndTime = hawlEnd ? new Date(hawlEnd).getTime() : NaN, waitingForHawl = hawlComplete === false || Number.isFinite(hawlEndTime) && hawlEndTime > Date.now();
      elements.cycle.textContent = cycleId ? `الدورة الحالية: ${cycleId}${hawlEnd ? ` · اكتمال الحول: ${String(hawlEnd).slice(0, 10)}` : ""}` : "لم يرجع الخادم رقم دورة حالية."; elements.gold.value = valueOf(inventory, "gold_price_per_gram") || inventory.settings?.gold_price_per_gram || ""; elements.gold.disabled = waitingForHawl; elements.save.disabled = waitingForHawl; elements.calculate.disabled = waitingForHawl; renderRows(""); renderSummary(response); feedback(waitingForHawl ? "الحول لم يكتمل بعد. سيفتح حقل سعر الذهب والحساب تلقائيًا بعد اكتمال سنة الدورة." : "تم تحميل تقييم المخزون من الخادم.", waitingForHawl);
    } catch (error) { if (!disposed) { rows = []; renderRows(""); elements.empty.querySelector("h3").textContent = "تعذّر تحميل بيانات الزكاة"; elements.empty.querySelector("p").textContent = "تحقق من الاتصال ثم أعد المحاولة."; feedback(friendlyError(error), true); } }
  };
  const requireCycle = () => { if (!cycleId) throw new Error("لم يرجع الخادم رقم دورة زكاة صالحة."); return cycleId; };
  elements.search.addEventListener("input", debounce(event => renderRows(event.target.value.trim().toLowerCase()), 350));
  elements.save.addEventListener("click", async () => { try { const price = Number(elements.gold.value); if (!(price > 0)) throw new Error("أدخل سعر جرام ذهب صحيحًا."); await api.patch("/api/v1/admin/zakat/settings", { cycle_id: requireCycle(), gold_price_per_gram: price }); feedback("تم حفظ سعر الذهب."); await load(); } catch (error) { feedback(friendlyError(error), true); } });
  elements.calculate.addEventListener("click", async () => { try { const result = await api.post("/api/v1/admin/zakat/calculate", { cycle_id: requireCycle(), idempotency_key: idempotencyKey() }); renderSummary(result); feedback("تم حساب الزكاة وحفظ نتيجة الدورة."); } catch (error) { feedback(friendlyError(error), true); } });
  elements.report.addEventListener("click", async () => { try { const report = await api.get(`/api/v1/admin/zakat/reports/${encodeURIComponent(requireCycle())}`); renderSummary(report); feedback("تم تحميل تقرير دورة الزكاة."); } catch (error) { feedback(friendlyError(error), true); } });
  elements.reminders.addEventListener("click", async () => { try { const result = await api.post("/api/v1/admin/zakat/reminders/run", {}); feedback(result?.message || "تم تشغيل تذكيرات الزكاة."); } catch (error) { feedback(friendlyError(error), true); } });
  load();
  return () => { disposed = true; };
}
