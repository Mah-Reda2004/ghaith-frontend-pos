import { bindThemeToggle, initTheme } from "../../core/theme.js";
import { getCurrentUser, getUserRole, isAuthenticated, logout } from "../../core/auth.js";
import { initStatusToggles } from "../../components/status-toggle/status-toggle.js";
import { initAppSelects } from "../../components/cashier-select/cashier-select.js";
import "../../components/printing/printing.js";

// Resolve routed assets from this module instead of the browser URL. This keeps
// the admin views working when the server rewrites or nests admin.html URLs.
const ADMIN_BASE_URL = new URL("./", import.meta.url);

const ROUTES = {
  settings: { html: "settings/settings.html", css: "settings/settings.css", load: () => import("./settings/settings.js"), init: "initSettings", title: "إعدادات التكاملات", selector: ".settings-page" },
  "purchase-invoice": {
    html: "purchase-invoice/purchase-invoice.html",
    css: "purchase-invoice/purchase-invoice.css",
    load: () => import("./purchase-invoice/purchase-invoice.js"),
    init: "initPurchaseInvoice",
    title: "إنشاء فاتورة مشتريات",
    selector: ".purchase-page"
  },
  zakat: {
    html: "zakat/zakat.html",
    css: "zakat/zakat.css",
    load: () => import("./zakat/zakat.js"),
    init: "initZakat",
    title: "إدارة الزكاة",
    selector: ".zakat-page"
  },
  discounts: {
    html: "discounts/discounts.html",
    css: "discounts/discounts.css",
    load: () => import("./discounts/discounts.js"),
    init: "initDiscounts",
    title: "إعدادات الخصومات",
    selector: ".discounts-page"
  },
  sales: {
    html: "sales/sales.html",
    css: "sales/sales.css",
    load: () => import("./sales/sales.js"),
    init: "initSales",
    title: "المبيعات",
    selector: ".sales-page"
  },
  dashboard: {
    html: "dashboard/dashboard.html",
    css: "dashboard/dashboard.css",
    load: () => import("./dashboard/dashboard.js"),
    init: "initDashboard",
    title: "الرئيسية",
    selector: ".dashboard-page"
  },
  inventory: {
    html: "inventory/inventory.html",
    css: "inventory/inventory.css",
    load: () => import("./inventory/inventory.js"),
    init: "initInventory",
    title: "المخزون",
    selector: ".inventory-page"
  },
  categories: {
    html: "categories/categories.html",
    css: "categories/categories.css",
    load: () => import("./categories/categories.js"),
    init: "initCategories",
    title: "إدارة الفئات والتصنيفات",
    selector: ".categories-page"
  },
  products: {
    html: "products/products.html",
    css: "products/products.css",
    load: () => import("./products/products.js"),
    init: "initProducts",
    title: "إدارة المنتجات والمخزون",
    selector: ".products-page"
  },
  suppliers: {
    html: "suppliers/suppliers.html",
    css: "suppliers/suppliers-layout.css",
    load: () => import("./suppliers/suppliers.js"),
    init: "initSuppliers",
    title: "إدارة الموردين",
    selector: ".suppliers-page"
  },
  users: {
    html: "users/users.html",
    css: "users/users-layout.css",
    load: () => import("./users/users.js"),
    init: "initUsers",
    title: "إدارة المستخدمين",
    selector: ".users-page"
  },
  reports: {
    html: "reports/reports.html",
    css: "reports/reports.css",
    load: () => import("./reports/reports.js"),
    init: "initReports",
    title: "التقارير",
    selector: ".reports-page"
  }
};

const viewRoot = document.getElementById("view-root");
const nav = document.getElementById("adminNav");
const routeStyle = document.getElementById("adminRouteStyle");
const sidebar = document.getElementById("adminSidebar");
const sidebarToggle = document.getElementById("adminSidebarToggle");
const sidebarOverlay = document.getElementById("adminSidebarOverlay");
let cleanupRoute;
let navigationId = 0;

initTheme();
bindThemeToggle(document.getElementById("adminThemeToggle"));
initStatusToggles();
initAppSelects(document);

function normalizeCurrencyLabels(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (/ر\.س|ج\.م|جنيه مصري|ريال/.test(node.nodeValue)) node.nodeValue = node.nodeValue.replaceAll("ر.س", "EGP").replaceAll("ج.م", "EGP").replaceAll("جنيه مصري", "EGP").replaceAll("ريال", "EGP");
  }
}

normalizeCurrencyLabels();
new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
  if (node.nodeType === Node.TEXT_NODE && /ر\.س|ج\.م|جنيه مصري|ريال/.test(node.nodeValue)) node.nodeValue = node.nodeValue.replaceAll("ر.س", "EGP").replaceAll("ج.م", "EGP").replaceAll("جنيه مصري", "EGP").replaceAll("ريال", "EGP");
  else if (node.nodeType === Node.ELEMENT_NODE) normalizeCurrencyLabels(node);
}))).observe(document.body, { childList: true, subtree: true });

const loginUrl = new URL("../auth/login/login.html", window.location.href).href;
const currentUser = getCurrentUser();
if (!isAuthenticated() || getUserRole(currentUser) !== "admin") {
  logout();
  window.location.replace(loginUrl);
  throw new Error("authentication-required");
}

const resolvedUser = currentUser?.user || currentUser?.data || currentUser?.profile || currentUser || {};
const displayName = resolvedUser.name || resolvedUser.full_name || resolvedUser.username || "مدير النظام";
const userLabel = document.getElementById("adminUserName");
const userAvatar = document.getElementById("adminAccountAvatar");
if (userLabel) userLabel.textContent = displayName;
if (userAvatar) userAvatar.textContent = displayName.trim().charAt(0) || "م";
document.querySelector(".logout-link")?.addEventListener("click", () => {
  logout();
  window.location.replace(loginUrl);
});
window.addEventListener("ghaith:session-expired", () => window.location.replace(loginUrl));

function getRouteName() {
  return window.location.hash.replace(/^#/, "") || "dashboard";
}

function setActiveNav(routeName) {
  const requestedRoute = routeName;
  const activeRoute = routeName === "purchase-invoice" ? "suppliers" : routeName;
  nav.querySelectorAll("[data-route]").forEach(link => {
    link.classList.toggle("is-active", link.dataset.route === activeRoute);
  });
  const title = ROUTES[requestedRoute]?.title || nav.querySelector(`[data-route="${activeRoute}"] span`)?.textContent || "لوحة الإدارة";
  const topbarTitle = document.getElementById("adminPageTitle");
  if (topbarTitle) topbarTitle.textContent = title;
}

function setSidebarOpen(isOpen) {
  sidebar.classList.toggle("is-open", isOpen);
  sidebarOverlay.classList.toggle("is-open", isOpen);
  sidebarToggle.setAttribute("aria-expanded", String(isOpen));
}

function renderPending(routeName) {
  const activeLink = nav.querySelector(`[data-route="${routeName}"] span`);
  const label = activeLink?.textContent || "الصفحة";
  cleanupRoute?.();
  cleanupRoute = undefined;
  routeStyle.removeAttribute("href");
  setActiveNav(routeName);
  document.title = `${label} — غيث`;
  viewRoot.innerHTML = `<section class="admin-view__pending"><h1>${label}</h1><p>سيتم تنفيذ هذه الشاشة في المرحلة التالية من لوحة الإدارة.</p></section>`;
}

async function waitForStyle(link, href) {
  const targetHref = new URL(href, ADMIN_BASE_URL).href;
  if (link.href === targetHref && link.sheet) return;

  await new Promise((resolve, reject) => {
    const handleLoad = () => {
      link.removeEventListener("error", handleError);
      resolve();
    };
    const handleError = () => {
      link.removeEventListener("load", handleLoad);
      reject(new Error("admin-style-load-failed"));
    };

    link.addEventListener("load", handleLoad, { once: true });
    link.addEventListener("error", handleError, { once: true });
    link.href = targetHref;
  });
}

async function loadRoute() {
  const routeName = getRouteName();
  const route = ROUTES[routeName];
  setSidebarOpen(false);
  if (!route) {
    renderPending(routeName);
    return;
  }

  const currentNavigation = ++navigationId;
  setActiveNav(routeName);
  viewRoot.innerHTML = '<div class="view-loading"><span class="spinner"></span><span>جاري تحميل الصفحة...</span></div>';

  try {
    await waitForStyle(routeStyle, route.css);
    const response = await window.fetch(new URL(route.html, ADMIN_BASE_URL));
    if (!response.ok) throw new Error("admin-view-load-failed");
    const source = await response.text();
    if (currentNavigation !== navigationId) return;
    const pageDocument = new DOMParser().parseFromString(source, "text/html");
    const content = pageDocument.querySelector(route.selector);
    if (!content) throw new Error("admin-view-content-missing");

    cleanupRoute?.();
    cleanupRoute = undefined;
    // Avoid replaceChildren here: some Live Server/devtools combinations wrap
    // it and throw while importing a DOMParser-owned node. Adopt then append
    // the route content explicitly instead.
    const routeContent = document.adoptNode(content);
    viewRoot.textContent = "";
    viewRoot.append(routeContent);
    const pageModule = await route.load();
    cleanupRoute = pageModule[route.init]?.() || undefined;
    document.title = `${route.title} — غيث`;
  } catch (error) {
    if (currentNavigation !== navigationId) return;
    console.error(`Failed to load admin route "${routeName}"`, error);
    viewRoot.innerHTML = '<section class="admin-view__error"><h2>تعذّر تحميل الصفحة</h2><p>حدثت مشكلة أثناء تجهيز الشاشة.</p><button class="btn btn-primary" id="retryAdminRoute" type="button">إعادة المحاولة</button></section>';
    document.getElementById("retryAdminRoute").addEventListener("click", loadRoute);
  }
}

sidebarToggle.addEventListener("click", () => setSidebarOpen(!sidebar.classList.contains("is-open")));
const accountTrigger = document.getElementById("adminAccountTrigger");
const accountMenu = document.getElementById("adminAccountMenu");
function setAccountMenu(open) {
  accountMenu.hidden = !open;
  accountTrigger.setAttribute("aria-expanded", String(open));
}
accountTrigger.addEventListener("click", event => {
  event.stopPropagation();
  setAccountMenu(accountMenu.hidden);
});
document.addEventListener("click", event => {
  if (!event.target.closest(".admin-account")) setAccountMenu(false);
});
sidebarOverlay.addEventListener("click", () => setSidebarOpen(false));
nav.addEventListener("click", event => {
  const link = event.target.closest("[data-route]");
  if (!link) return;

  const nextHash = `#${link.dataset.route}`;
  if (window.location.hash === nextHash) {
    event.preventDefault();
    loadRoute();
  }
  setSidebarOpen(false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") setSidebarOpen(false);
});
window.addEventListener("hashchange", loadRoute);

window.bindAdminThemeToggle = button => bindThemeToggle(button);
loadRoute();
