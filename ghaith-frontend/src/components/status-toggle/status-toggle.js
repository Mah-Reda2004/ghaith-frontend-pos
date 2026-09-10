function isStatusSelect(select) {
  if (!(select instanceof HTMLSelectElement) || select.dataset.statusToggleReady) return false;
  const values = [...select.options].map(option => option.value);
  return values.length === 2 && values.includes("active") && values.includes("inactive");
}

function syncToggle(select) {
  const button = select.nextElementSibling;
  if (!button?.classList.contains("status-toggle")) return;
  const active = select.value === "active";
  button.classList.toggle("is-inactive", !active);
  button.setAttribute("aria-checked", String(active));
  button.setAttribute("aria-label", active ? "الحالة: نشط. اضغط للإيقاف" : "الحالة: غير نشط. اضغط للتفعيل");
  button.querySelector(".status-toggle__label").textContent = active ? "نشط" : "غير نشط";
}

function enhanceSelect(select) {
  if (!isStatusSelect(select)) return;
  select.dataset.statusToggleReady = "true";
  select.classList.add("status-toggle-select");
  const button = document.createElement("button");
  button.className = "status-toggle";
  button.type = "button";
  button.setAttribute("role", "switch");
  button.innerHTML = '<span class="status-toggle__label"></span><span class="status-toggle__track" aria-hidden="true"><span class="status-toggle__thumb"></span></span>';
  select.insertAdjacentElement("afterend", button);
  button.addEventListener("click", () => {
    select.value = select.value === "active" ? "inactive" : "active";
    syncToggle(select);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  syncToggle(select);
}

function enhanceWithin(root) {
  if (root instanceof HTMLSelectElement) enhanceSelect(root);
  root.querySelectorAll?.("select").forEach(enhanceSelect);
}

export function initStatusToggles() {
  enhanceWithin(document);
  const observer = new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE) enhanceWithin(node); });
      if (record.type === "attributes") record.target.querySelectorAll?.("select[data-status-toggle-ready]").forEach(syncToggle);
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("change", event => { if (event.target.matches?.("select[data-status-toggle-ready]")) syncToggle(event.target); });
  return () => observer.disconnect();
}
