// ==========================================================================
// إدارة الثيم (فاتح/غامق) — بيتحفظ في localStorage عشان يفضل نفس الاختيار
// حتى لو المستخدم قفل المتصفح وفتحه تاني.
// ==========================================================================

const STORAGE_KEY = "ghaith-theme";

export function getStoredTheme() {
  return localStorage.getItem(STORAGE_KEY);
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY, theme);
  document.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
}

/** ينده وقت تحميل الصفحة عشان يظبط الثيم قبل ما أي حاجة تترسم */
export function initTheme() {
  const stored = getStoredTheme();
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  const theme = stored || (prefersLight ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", theme);
  return theme;
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

/** بيربط زرار التبديل بمنطق الثيم + بيحدّث الأيقونة (شمس/قمر) */
export function bindThemeToggle(buttonEl) {
  if (!buttonEl) return;
  const sync = (theme) => {
    buttonEl.setAttribute("aria-label", theme === "dark" ? "التحويل للوضع الفاتح" : "التحويل للوضع الغامق");
    buttonEl.dataset.theme = theme;
  };
  sync(document.documentElement.getAttribute("data-theme") || "dark");
  buttonEl.addEventListener("click", () => sync(toggleTheme()));
}
