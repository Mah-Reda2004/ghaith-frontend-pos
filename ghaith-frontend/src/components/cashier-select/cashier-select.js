const instances = new WeakMap();
let active = null;
let menu = null;

const textOf = option => option?.textContent?.trim() || "اختر...";
const escapeHtml = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function ensureMenu() {
  if (menu) return menu;
  menu = document.createElement("div");
  menu.className = "cashier-select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  document.body.append(menu);
  menu.addEventListener("click", event => {
    const item = event.target.closest("[data-select-index]");
    if (!item || item.disabled || !active) return;
    const instance = active;
    instance.select.selectedIndex = Number(item.dataset.selectIndex);
    instance.select.dispatchEvent(new Event("input", { bubbles: true }));
    instance.select.dispatchEvent(new Event("change", { bubbles: true }));
    refresh(instance.select);
    closeMenu();
    instance.button.focus();
  });
  return menu;
}

function refresh(select) {
  const instance = instances.get(select);
  if (!instance) return;
  instance.button.querySelector(".cashier-select__value").textContent = textOf(select.selectedOptions[0]);
  instance.button.disabled = select.disabled;
  instance.button.classList.toggle("is-placeholder", !select.value);
  if (active?.select === select) renderOptions(instance);
}

function renderOptions(instance) {
  ensureMenu().innerHTML = [...instance.select.options].map((option, index) => `
    <button class="cashier-select-menu__option${index === instance.select.selectedIndex ? " is-selected" : ""}" type="button" role="option" aria-selected="${index === instance.select.selectedIndex}" data-select-index="${index}" ${option.disabled ? "disabled" : ""}>
      <span>${escapeHtml(option.textContent)}</span>${index === instance.select.selectedIndex ? '<span class="cashier-select-menu__check" aria-hidden="true">✓</span>' : ""}
    </button>`).join("");
}

function positionMenu(button) {
  const rect = button.getBoundingClientRect(), gap = 7, width = Math.max(rect.width, 180), maxHeight = Math.min(320, Math.max(150, innerHeight - 28));
  menu.style.width = `${width}px`;
  menu.style.maxHeight = `${maxHeight}px`;
  menu.style.left = `${Math.max(10, Math.min(innerWidth - width - 10, rect.left))}px`;
  const menuHeight = Math.min(menu.scrollHeight, maxHeight), availableBelow = innerHeight - rect.bottom - gap;
  menu.style.top = `${availableBelow >= Math.min(menuHeight, 180) ? rect.bottom + gap : Math.max(10, rect.top - menuHeight - gap)}px`;
}

function openMenu(instance) {
  if (instance.select.disabled) return;
  if (active?.select === instance.select && !menu.hidden) { closeMenu(); return; }
  closeMenu();
  active = instance;
  renderOptions(instance);
  menu.hidden = false;
  instance.button.classList.add("is-open");
  instance.button.setAttribute("aria-expanded", "true");
  positionMenu(instance.button);
  menu.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
}

function closeMenu() {
  if (!active) return;
  active.button.classList.remove("is-open");
  active.button.setAttribute("aria-expanded", "false");
  if (menu) menu.hidden = true;
  active = null;
}

function enhance(select) {
  if (instances.has(select) || select.multiple || select.size > 1) return;
  const wrapper = document.createElement("span");
  wrapper.className = "cashier-select";
  select.before(wrapper);
  wrapper.append(select);
  select.classList.add("cashier-select__native");
  const button = document.createElement("button");
  button.className = "cashier-select__trigger";
  button.type = "button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = '<span class="cashier-select__value"></span><span class="cashier-select__chevron" aria-hidden="true"></span>';
  wrapper.append(button);
  const instance = { select, button };
  instances.set(select, instance);
  new MutationObserver(() => refresh(select)).observe(select, { childList: true, subtree: true, attributes: true });
  select.addEventListener("change", () => refresh(select));
  select.addEventListener("invalid", () => button.focus());
  button.addEventListener("click", event => { event.preventDefault(); openMenu(instance); });
  button.addEventListener("keydown", event => {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); openMenu(instance); }
    if (event.key === "Escape") closeMenu();
  });
  refresh(select);
}

export function initCashierSelects(root = document) {
  ensureMenu();
  const scan = node => {
    if (node.nodeType !== Node.ELEMENT_NODE && node !== document) return;
    if (node.matches?.("select")) enhance(node);
    node.querySelectorAll?.("select").forEach(enhance);
  };
  scan(root);
  const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(scan)));
  observer.observe(root, { childList: true, subtree: true });
  document.addEventListener("pointerdown", event => { if (active && !active.button.contains(event.target) && !menu.contains(event.target)) closeMenu(); });
  window.addEventListener("resize", closeMenu);
  window.addEventListener("scroll", closeMenu, true);
  return () => { observer.disconnect(); closeMenu(); };
}

export const initAppSelects = initCashierSelects;
