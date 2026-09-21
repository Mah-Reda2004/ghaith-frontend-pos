import { bindThemeToggle, initTheme } from "../../core/theme.js";
import "../../components/printing/printing.js";
import { initNotificationCenter } from "../../components/notifications/notifications.js";
import { initCashierSelects } from "../../components/cashier-select/cashier-select.js";
import { getCurrentUser, getUserRole, isAuthenticated, logout } from "../../core/auth.js";

const ROUTES = {
  pos: { html: "pos/pos.html", script: "pos/pos.js", module: true, title: "نقطة البيع", selector: ".pos-body", extras: [".pos-cart-fab", "#variantOverlay", "#paymentOverlay", ".toast-stack", "#printArea"] },
  invoices: { html: "invoices/invoices.html", css: "invoices/invoices.css", script: "invoices/invoices.js", module: true, title: "سجل الفواتير", selector: ".inv-body", extras: ["#invoiceDetailOverlay", "#returnFlowOverlay", ".toast-stack", "#printArea"] },
  debts: { html: "debts/debts.html", css: "debts/debts.css", script: "debts/debts.js", module: true, title: "المديونيات", selector: ".debts-page", extras: ["#debtDetailOverlay", "#debtPaymentOverlay", ".toast-stack", "#printArea"] },
  expenses: { html: "expenses/expenses.html", css: "expenses/expenses.css", script: "expenses/expenses.js", module: true, title: "المصروفات", selector: ".exp-body", extras: ["#addExpenseOverlay", "#expSuccessOverlay", ".toast-stack"] },
  "shift-close": { html: "shift-close/shift-close.html", css: "shift-close/shift-close.css", script: "shift-close/shift-close.js", module: true, title: "إغلاق الوردية", selector: ".sc-body", extras: ["#confirmModal", "#successOverlay", ".toast-stack"] },
  profile: { html: "profile/profile.html", css: "profile/profile.css", script: "profile/profile.js", module: true, title: "البروفايل", selector: ".profile-body", extras: [] }
};

const view = document.getElementById("cashierView");
const shell = document.querySelector(".cashier-shell");
const nav = document.getElementById("cashierNav");
const routeStyle = document.getElementById("cashierRouteStyle");
const userMenu = document.getElementById("cashierUserMenu");
const userMenuButton = document.getElementById("userMenuBtn");
const userMenuDropdown = document.getElementById("userMenuDropdown");
const currentUserName = document.getElementById("currentUserName");
let activeScript;
let navigationId = 0;
const assetVersion = new URL(window.location.href).searchParams.get("v");

function routeAssetUrl(path, params = {}) {
  const url = new URL(path, window.location.href);
  if (assetVersion) url.searchParams.set("v", assetVersion);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
}

initTheme();
const loginUrl = new URL("../auth/login/index.html", window.location.href).href;
if (!isAuthenticated()) {
  window.location.replace(loginUrl);
  throw new Error("authentication-required");
}
bindThemeToggle(document.getElementById("themeToggleBtn"));
initCashierSelects(document);
const currentUser = getCurrentUser();
const currentUserRole = getUserRole(currentUser);
const isSalesUser = currentUserRole === "sales";
const displayName = currentUser?.name || currentUser?.username || userMenu.dataset.userName;
currentUserName.textContent = displayName;
userMenu.dataset.userName = displayName;
document.querySelector(".pos-user-menu__identity span").textContent = isSalesUser ? "موظف مبيعات" : "كاشير";
if (isSalesUser) {
  nav.remove();
  document.getElementById("notificationCenter").remove();
  document.querySelector(".pos-topbar__brand span").textContent = "البروفايل";
} else {
  initNotificationCenter();
}
window.addEventListener("ghaith:session-expired", () => window.location.replace(loginUrl));

function setUserMenuOpen(isOpen) {
  userMenuButton.setAttribute("aria-expanded", String(isOpen));
  userMenuDropdown.hidden = !isOpen;
}

userMenuButton.addEventListener("click", event => {
  event.stopPropagation();
  setUserMenuOpen(userMenuDropdown.hidden);
});

userMenuDropdown.addEventListener("click", event => {
  const action = event.target.closest("[data-user-action]");
  if (!action) return;
  setUserMenuOpen(false);
  if (action.dataset.userAction === "logout") {
    logout();
    window.location.replace(loginUrl);
  }
});

document.addEventListener("click", event => {
  if (!userMenu.contains(event.target)) setUserMenuOpen(false);
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || userMenuDropdown.hidden) return;
  setUserMenuOpen(false);
  userMenuButton.focus();
});

function getRouteName() {
  const requestedRoute = window.location.hash.replace(/^#/, "") || "pos";
  if (!isSalesUser) return requestedRoute;
  if (requestedRoute !== "profile") {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#profile`);
  }
  return "profile";
}

function setActiveNav(routeName) {
  nav.querySelectorAll("[data-route]").forEach(link => {
    link.classList.toggle("is-active", link.dataset.route === routeName);
  });
  userMenuButton.classList.toggle("is-active", routeName === "profile");
}

function renderPending(routeName) {
  const labels = { "shift-close": "إغلاق الوردية" };
  setActiveNav(routeName);
  document.title = `${labels[routeName] || "الكاشير"} — غيث`;
  routeStyle.removeAttribute("href");
  if (activeScript) activeScript.remove();
  view.innerHTML = `<section class="cashier-view__pending"><h1>${labels[routeName] || "الصفحة"}</h1><p>سيتم تنفيذ هذه الشاشة داخل نفس صفحة الكاشير عند استلام التصميم الخاص بها.</p></section>`;
}

async function loadRoute() {
  const routeName = getRouteName();
  const route = ROUTES[routeName];
  if (!route) {
    renderPending(routeName);
    return;
  }

  const currentNavigation = ++navigationId;
  shell.classList.add("is-loading");
  setActiveNav(routeName);
  view.innerHTML = '<div class="cashier-view__loading"><div class="inv-spinner"></div><p>جاري تحميل الصفحة...</p></div>';

  try {
    if (route.css) {
      routeStyle.href = routeAssetUrl(route.css);
      await new Promise((resolve, reject) => {
        routeStyle.onload = resolve;
        routeStyle.onerror = reject;
      });
    } else {
      routeStyle.removeAttribute("href");
    }

    const response = await window.fetch(routeAssetUrl(route.html));
    if (!response.ok) throw new Error("view-load-failed");
    const source = await response.text();
    if (currentNavigation !== navigationId) return;
    const documentView = new DOMParser().parseFromString(source, "text/html");
    const content = documentView.querySelector(route.selector);
    if (!content) throw new Error("view-content-missing");

    const fragment = document.createDocumentFragment();
    fragment.appendChild(document.importNode(content, true));
    route.extras.forEach(selector => {
      const extra = documentView.querySelector(selector);
      if (extra) fragment.appendChild(document.importNode(extra, true));
    });
    view.replaceChildren(fragment);

    if (activeScript) activeScript.remove();
    activeScript = document.createElement("script");
    if (route.module) activeScript.type = "module";
    activeScript.src = routeAssetUrl(route.script, { route: currentNavigation });
    activeScript.id = "cashierRouteScript";
    activeScript.onerror = () => renderRouteError();
    document.body.appendChild(activeScript);
    document.title = `${route.title} — غيث`;
  } catch (error) {
    if (currentNavigation === navigationId) renderRouteError();
  } finally {
    if (currentNavigation === navigationId) shell.classList.remove("is-loading");
  }
}

function renderRouteError() {
  view.innerHTML = '<section class="cashier-view__error"><h2>تعذّر تحميل الصفحة</h2><button class="btn btn-primary" id="retryCashierRoute" type="button">إعادة المحاولة</button></section>';
  document.getElementById("retryCashierRoute").addEventListener("click", loadRoute);
}

window.addEventListener("hashchange", () => {
  if (isSalesUser && window.location.hash !== "#profile") {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#profile`);
    return;
  }
  loadRoute();
});
loadRoute();
