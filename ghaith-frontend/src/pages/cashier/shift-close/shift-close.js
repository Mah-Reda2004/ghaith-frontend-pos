(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* الثيم */
  /* ------------------------------------------------------------------ */
  const THEME_KEY = "ghaith-theme";
  function initTheme() {
    document.documentElement.setAttribute(
      "data-theme",
      localStorage.getItem(THEME_KEY) || "dark"
    );
  }
  initTheme();
  
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const next =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "light"
          : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(THEME_KEY, next);
    });
  }

  /* ------------------------------------------------------------------ */
  /* تحديث التاريخ */
  /* ------------------------------------------------------------------ */
  const shiftDateEl = document.getElementById("shiftDate");
  if (shiftDateEl) {
    const now = new Date();
    shiftDateEl.textContent = now.toLocaleDateString("ar-EG-u-nu-latn", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  /* ------------------------------------------------------------------ */
  /* التوجيه لصفحة المصروفات */
  /* ------------------------------------------------------------------ */
  const viewExpensesBtn = document.getElementById("viewExpensesBtn");
  if (viewExpensesBtn) {
    viewExpensesBtn.addEventListener("click", () => {
      window.location.href = document.documentElement.dataset.cashierSpa === "true"
        ? "#expenses"
        : "../expenses/expenses.html";
    });
  }

  const exportShiftBtn = document.getElementById("exportShiftBtn");
  if (exportShiftBtn) {
    exportShiftBtn.addEventListener("click", () => window.GhaithPrint?.exportTableExcel({title:"تقرير إغلاق الوردية",table:document.querySelector(".sc-pay-table"),fileName:"ghaith-shift"}));
  }

  /* ------------------------------------------------------------------ */
  /* مودال التأكيد */
  /* ------------------------------------------------------------------ */
  const closeShiftBtn = document.getElementById("closeShiftBtn");
  const confirmModal = document.getElementById("confirmModal");
  const cancelCloseBtn = document.getElementById("cancelCloseBtn");
  const confirmCloseBtn = document.getElementById("confirmCloseBtn");
  const successOverlay = document.getElementById("successOverlay");

  if (closeShiftBtn && confirmModal) {
    closeShiftBtn.addEventListener("click", () => {
      confirmModal.style.display = "flex";
    });
  }

  if (cancelCloseBtn && confirmModal) {
    cancelCloseBtn.addEventListener("click", () => {
      confirmModal.style.display = "none";
    });
  }

  if (confirmModal) {
    confirmModal.addEventListener("click", (event) => {
      if (event.target === confirmModal) confirmModal.style.display = "none";
    });
  }

  if (confirmCloseBtn && confirmModal && successOverlay) {
    confirmCloseBtn.addEventListener("click", () => {
      confirmModal.style.display = "none";
      successOverlay.style.display = "flex";
    });
  }

  /* ------------------------------------------------------------------ */
  /* مودال النجاح */
  /* ------------------------------------------------------------------ */
  const printReportBtn = document.getElementById("printReportBtn");
  const newShiftBtn = document.getElementById("newShiftBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (printReportBtn) {
    printReportBtn.addEventListener("click", () => {
      window.GhaithPrint?.printTable({title:"تقرير إغلاق الوردية",subtitle:"ملخص طرق الدفع والحركة المالية للوردية",table:document.querySelector(".sc-pay-table"),summary:[{label:"إجمالي المبيعات",value:document.querySelector(".sc-metric strong")?.textContent.trim()||"—"}]});
    });
  }

  if (newShiftBtn) {
    newShiftBtn.addEventListener("click", () => {
      window.location.href = "../pos/pos.html";
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      // Assuming a generic login route at the root or just reloading for demo
      window.location.href = "../../../index.html"; 
    });
  }

})();
