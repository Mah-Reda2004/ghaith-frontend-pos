// ==========================================================================
// أدوات عامة يستخدمها أي جزء في المشروع
// ==========================================================================

/**
 * بيأخر تنفيذ الدالة لحد ما المستخدم يوقف عن الكتابة (مفيد في خانات البحث
 * عشان ملبعتش request لكل حرف بيتكتب).
 */
export function debounce(fn, delay = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** تنسيق الأرقام كعملة (جنيه / ريال..) حسب اللوكال العربي */
export function formatCurrency(value, currency = "") {
  const num = Number(value ?? 0).toLocaleString("ar-EG", {
    maximumFractionDigits: 2,
  });
  return currency ? `${num} ${currency}` : num;
}

export function formatNumber(value) {
  return Number(value ?? 0).toLocaleString("ar-EG");
}

export function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** اختصار لإنشاء عنصر HTML من نص، بيرجع أول عنصر جواه */
export function el(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

/** حماية بسيطة من XSS لو بنطبع نص جاي من المستخدم/الـ API جوه innerHTML */
export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** تنفيذ دالة لما عنصر يظهر في الشاشة (lazy loading للصور/الرسوم) */
export function onVisible(target, callback, options = {}) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        callback(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, options);
  observer.observe(target);
  return observer;
}
