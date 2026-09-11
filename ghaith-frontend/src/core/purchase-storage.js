const KEY = "ghaith-purchase-prototype-v1";
export const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export function purchaseTotals(invoice) {
  const subtotal = roundMoney(invoice.items.reduce((sum, item) => sum + item.quantity * item.cost, 0));
  const lineDiscount = roundMoney(invoice.items.reduce((sum, item) => sum + item.discount, 0));
  const total = roundMoney(subtotal - lineDiscount - Number(invoice.discount) + Number(invoice.shipping));
  const paid = invoice.paymentState === "full" ? total : invoice.paymentState === "deferred" ? 0 : roundMoney(invoice.paid);
  return { subtotal, lineDiscount, total, paid, remaining: roundMoney(total - paid) };
}
function emptyData() { return { version: 1, suppliers: [], categories: [], variants: [], invoices: [], draft: null }; }
export function readPurchaseData() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return emptyData();
  const data = JSON.parse(raw);
  if (data.version !== 1 || ![data.suppliers, data.categories, data.variants, data.invoices].every(Array.isArray)) throw new Error("تعذّر قراءة البيانات المحلية المحفوظة.");
  const hasDemoData = [...data.suppliers, ...data.categories, ...data.variants].some(item => String(item?.id || "").startsWith("demo-"));
  if (hasDemoData) { localStorage.removeItem(KEY); return emptyData(); }
  return data;
}
export function writePurchaseData(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch { throw new Error("تعذّر الحفظ على هذا المتصفح. تأكد من إتاحة التخزين ووجود مساحة كافية."); }
}
export function validatePurchase(invoice) {
  const errors = {};
  if (!invoice.supplierId) errors.supplierId = "اختر المورد أولًا.";
  if (!invoice.date) errors.date = "حدد تاريخ الفاتورة.";
  if (!invoice.items.length) errors.items = "أضف صنفًا واحدًا على الأقل.";
  if (invoice.items.some(item => !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.cost) || item.cost < 0 || !Number.isFinite(item.discount) || item.discount < 0 || item.discount > roundMoney(item.quantity * item.cost))) errors.items = "راجع الأصناف: الكمية عدد صحيح موجب، والسعر غير سالب، وخصم السطر لا يتجاوز قيمته.";
  for (const key of ["discount", "shipping", "paid"]) if (!Number.isFinite(Number(invoice[key])) || Number(invoice[key]) < 0) errors[key] = "أدخل قيمة صحيحة لا تقل عن صفر.";
  const totals = purchaseTotals(invoice);
  if (invoice.discount > totals.subtotal - totals.lineDiscount) errors.discount = "الخصم أكبر من قيمة الأصناف بعد خصومات السطور.";
  if (totals.paid > totals.total) errors.paid = "المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة.";
  if (invoice.paymentState === "partial" && (totals.paid <= 0 || totals.paid >= totals.total)) errors.paid = "في الدفع الجزئي، أدخل مبلغًا أكبر من صفر وأقل من الإجمالي.";
  if (invoice.paymentState !== "full" && !invoice.dueDate) errors.dueDate = "حدد تاريخ استحقاق المبلغ المتبقي.";
  if (invoice.dueDate && invoice.dueDate < invoice.date) errors.dueDate = "تاريخ الاستحقاق لا يسبق تاريخ الفاتورة.";
  return errors;
}
