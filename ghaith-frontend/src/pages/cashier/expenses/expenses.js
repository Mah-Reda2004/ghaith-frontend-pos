// ==========================================================================

import { api, idempotencyKey, listFrom } from "../../../core/api.js";
// المصروفات — منطق كامل: بطاقات الإحصائيات، جدول المصروفات، إضافة مصروف،
// مودال النجاح، بحث، Pagination
// ==========================================================================

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* 1) الثيم                                                            */
  /* ------------------------------------------------------------------ */
  const THEME_KEY = "ghaith-theme";
  function initTheme() {
    document.documentElement.setAttribute(
      "data-theme",
      localStorage.getItem(THEME_KEY) || "dark"
    );
  }
  if (document.documentElement.dataset.cashierSpa !== "true") {
    initTheme();
    document.getElementById("themeToggleBtn").addEventListener("click", () => {
      const next =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "light"
          : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(THEME_KEY, next);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 2) Mock Data                                                        */
  /* ------------------------------------------------------------------ */
  const FALLBACK_EXPENSE_TYPES = ["نظافة", "ضيافة", "صيانة", "بخور", "مواصلات", "أخرى"];

  const MOCK_EXPENSES = [
    {
      id: "EXP-101",
      type: "نظافة",
      description: "شراء مساحيق تنظيف وأدوات نظافة للمحل",
      amount: 100.0,
      date: "2023-11-20T10:35:00",
      cashier: "أحمد محمود",
      status: "مسجل",
    },
    {
      id: "EXP-102",
      type: "ضيافة",
      description: "قهوة وشاي وضيافة للعملاء",
      amount: 50.0,
      date: "2023-11-20T12:15:00",
      cashier: "محمد علي",
      status: "مسجل",
    },
    {
      id: "EXP-103",
      type: "صيانة",
      description: "إصلاح مكيف الهواء",
      amount: 250.0,
      date: "2023-11-19T09:00:00",
      cashier: "أحمد محمود",
      status: "مسجل",
    },
    {
      id: "EXP-104",
      type: "بخور",
      description: "شراء بخور للمحل",
      amount: 80.0,
      date: "2023-11-19T14:20:00",
      cashier: "محمد علي",
      status: "مسجل",
    },
    {
      id: "EXP-105",
      type: "مواصلات",
      description: "مواصلات توصيل بضاعة",
      amount: 120.0,
      date: "2023-11-18T11:45:00",
      cashier: "أحمد محمود",
      status: "مسجل",
    },
    {
      id: "EXP-106",
      type: "نظافة",
      description: "شراء مناديل ومعطرات",
      amount: 45.0,
      date: "2023-11-18T16:30:00",
      cashier: "محمد علي",
      status: "مسجل",
    },
  ];

  /* ------------------------------------------------------------------ */
  /* 3) الحالة                                                           */
  /* ------------------------------------------------------------------ */
  const state = {
    expenses: [],
    page: 1,
    pageSize: 5,
    searchQuery: "",
    nextId: 107,
    // Stats
    totalToday: 0,
    totalCount: 0,
    shiftExpenses: 0,
    availableCash: 0,
    currentShift: null,
  };

  /* ------------------------------------------------------------------ */
  /* 4) عناصر DOM                                                        */
  /* ------------------------------------------------------------------ */
  const els = {
    // Stats
    statToday: document.getElementById("statToday"),
    statCount: document.getElementById("statCount"),
    statShift: document.getElementById("statShift"),
    statCash: document.getElementById("statCash"),
    // Search & Table
    searchInput: document.getElementById("expSearchInput"),
    tableBody: document.getElementById("expTableBody"),
    paginationInfo: document.getElementById("expPaginationInfo"),
    paginationPages: document.getElementById("expPaginationPages"),
    // Add Expense Modal
    addBtn: document.getElementById("addExpenseBtn"),
    addOverlay: document.getElementById("addExpenseOverlay"),
    closeAddBtn: document.getElementById("closeAddExpenseBtn"),
    cancelAddBtn: document.getElementById("cancelAddExpenseBtn"),
    confirmAddBtn: document.getElementById("confirmAddExpenseBtn"),
    expTypeSelect: document.getElementById("expTypeSelect"),
    expAmountInput: document.getElementById("expAmountInput"),
    expDescInput: document.getElementById("expDescInput"),
    expNotesInput: document.getElementById("expNotesInput"),
    balanceAvailable: document.getElementById("balanceAvailable"),
    balanceAfter: document.getElementById("balanceAfter"),
    infoDate: document.getElementById("infoDate"),
    infoCashier: document.getElementById("infoCashier"),
    infoShift: document.getElementById("infoShift"),
    // Success Modal
    successOverlay: document.getElementById("expSuccessOverlay"),
    successRefNo: document.getElementById("successRefNo"),
    successType: document.getElementById("successType"),
    successAmount: document.getElementById("successAmount"),
    successTime: document.getElementById("successTime"),
    successShift: document.getElementById("successShift"),
    closeSuccessBtn: document.getElementById("closeSuccessBtn"),
    // Toast
    toastStack: document.getElementById("toastStack"),
  };

  /* ------------------------------------------------------------------ */
  /* 5) أدوات مساعدة                                                     */
  /* ------------------------------------------------------------------ */
  function escapeHtml(str = "") {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatMoney(n) {
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(iso) {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const time = d.toLocaleTimeString("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return { date, time };
  }

  function showToast(msg, type = "success") {
    const el = document.createElement("div");
    el.className = "toast" + (type === "error" ? " is-error" : "");
    el.textContent = msg;
    els.toastStack.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function debounce(fn, ms = 350) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  async function loadExpenseTypes() {
    try {
      const data = await api.get("/api/v1/expense-types"), items = listFrom(data);
      const types = items.map(item => typeof item === "string" ? { id: item, name: item } : { id: item.id || item.name, name: item.name }).filter(item => item.id && item.name);
      renderExpenseTypes(types.length ? types : FALLBACK_EXPENSE_TYPES.map(name => ({ id: name, name })));
    } catch { renderExpenseTypes(FALLBACK_EXPENSE_TYPES.map(name => ({ id: name, name }))); }
  }

  function normalizeExpense(item) {
    const type = item.expense_type || {}, cashier = item.cashier || item.created_by || {};
    return { ...item, id: String(item.id), type: type.name || item.expense_type_name || item.type || "مصروف", description: item.description || "—", notes: item.notes || "—", shiftId: item.shift_id || item.shift?.id || "—", amount: Number(item.amount || 0), date: item.created_at || item.date || new Date().toISOString(), cashier: cashier.name || cashier.username || item.cashier_name || "—", status: item.status || "مسجل" };
  }

  async function loadExpenses() {
    try {
      const shiftResponse = await api.get("/api/v1/shifts/current");
      state.currentShift = shiftResponse?.shift || shiftResponse?.data || shiftResponse;
      const shiftId = state.currentShift?.id || state.currentShift?.shift_id;
      if (!shiftId) throw new Error("لا توجد وردية مفتوحة");
      const [expensesResponse, cashResponse] = await Promise.all([api.get("/api/v1/expenses", { query: { shift_id: shiftId, page: 1, page_size: 100 } }), api.get("/api/v1/expenses/available-cash", { query: { shift_id: shiftId } })]);
      state.expenses = listFrom(expensesResponse).map(normalizeExpense);
      state.totalCount = state.expenses.length;
      state.shiftExpenses = state.expenses.reduce((sum, item) => sum + item.amount, 0);
      const today = new Date().toISOString().slice(0, 10);
      state.totalToday = state.expenses.filter(item => item.date.slice(0, 10) === today).reduce((sum, item) => sum + item.amount, 0);
      state.availableCash = Number(cashResponse?.available_cash ?? cashResponse?.amount ?? cashResponse?.data?.available_cash ?? 0);
      renderStats(); renderTable();
    } catch (error) { state.expenses = []; renderStats(); renderTable(); showToast(error.message, "error"); }
  }

  function renderExpenseTypes(types) {
    if (!els.expTypeSelect) return;
    els.expTypeSelect.innerHTML = '<option value="">اختر نوع المصروف...</option>' + types.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  }

  /* ------------------------------------------------------------------ */
  /* 6) إحصائيات البطاقات                                                */
  /* ------------------------------------------------------------------ */
  function renderStats() {
    if (els.statToday)
      els.statToday.innerHTML = `${formatMoney(state.totalToday).replace('.00', '')}<small>جنيه</small>`;
    if (els.statCount)
      els.statCount.innerHTML = `${state.totalCount}<small>عمليات</small>`;
    if (els.statShift)
      els.statShift.innerHTML = `${formatMoney(state.shiftExpenses).replace('.00', '')}<small>جنيه</small>`;
    if (els.statCash)
      els.statCash.innerHTML = `${formatMoney(state.availableCash).replace('.00', '')}<small>جنيه</small>`;
  }

  /* ------------------------------------------------------------------ */
  /* 7) جدول المصروفات                                                   */
  /* ------------------------------------------------------------------ */
  function getFiltered() {
    const q = state.searchQuery.trim().toLowerCase();
    if (!q) return state.expenses;
    return state.expenses.filter(
      (exp) =>
        exp.id.toLowerCase().includes(q) ||
        exp.type.includes(q) ||
        exp.description.includes(q) ||
        exp.cashier.includes(q)
    );
  }

  function renderTable() {
    const filtered = getFiltered();
    const total = filtered.length;

    if (total === 0) {
      els.tableBody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="exp-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <p>لا توجد مصروفات مطابقة للبحث</p>
            </div>
          </td>
        </tr>`;
      if (els.paginationInfo) els.paginationInfo.textContent = "";
      if (els.paginationPages) els.paginationPages.innerHTML = "";
      return;
    }

    const start = (state.page - 1) * state.pageSize;
    const pageData = filtered.slice(start, start + state.pageSize);

    els.tableBody.innerHTML = pageData
      .map((exp) => {
        const { date, time } = formatDate(exp.date);
        return `
        <tr>
          <td><span class="exp-no">#${escapeHtml(exp.id)}</span></td>
          <td><span class="exp-type-badge">${escapeHtml(exp.type)}</span></td>
          <td><span class="exp-desc">${escapeHtml(exp.description)}</span></td>
          <td><span class="exp-desc">${escapeHtml(exp.notes)}</span></td>
          <td><span class="exp-amount">${formatMoney(exp.amount)}<small>ج.م</small></span></td>
          <td class="num" dir="ltr">${escapeHtml(exp.shiftId)}</td>
          <td>
            <div class="exp-date-cell">
              <span class="exp-date">${escapeHtml(date)}</span>
              <span class="exp-time">${escapeHtml(time)}</span>
            </div>
          </td>
          <td><span class="exp-cashier">${escapeHtml(exp.cashier)}</span></td>
          <td><span class="exp-status is-registered">مسجل</span></td>
        </tr>`;
      })
      .join("");

    // Pagination
    const endItem = Math.min(start + state.pageSize, total);
    if (els.paginationInfo)
      els.paginationInfo.textContent = `عرض ${start + 1} إلى ${endItem} من ${total} مدخلات`;

    const totalPages = Math.ceil(total / state.pageSize);
    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    if (!els.paginationPages) return;
    const frag = document.createDocumentFragment();

    // Previous
    const prev = document.createElement("button");
    prev.className = "page-btn";
    prev.textContent = "السابق";
    prev.disabled = state.page === 1;
    prev.addEventListener("click", () => {
      if (state.page > 1) {
        state.page--;
        renderTable();
      }
    });
    frag.appendChild(prev);

    // Pages
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement("button");
      btn.className = "page-btn" + (i === state.page ? " is-active" : "");
      btn.textContent = i;
      btn.addEventListener("click", () => {
        state.page = i;
        renderTable();
      });
      frag.appendChild(btn);
    }

    // Next
    const next = document.createElement("button");
    next.className = "page-btn";
    next.textContent = "التالي";
    next.disabled = state.page === totalPages;
    next.addEventListener("click", () => {
      if (state.page < totalPages) {
        state.page++;
        renderTable();
      }
    });
    frag.appendChild(next);

    els.paginationPages.innerHTML = "";
    els.paginationPages.appendChild(frag);
  }

  /* ------------------------------------------------------------------ */
  /* 8) البحث                                                            */
  /* ------------------------------------------------------------------ */
  if (els.searchInput) {
    els.searchInput.addEventListener(
      "input",
      debounce(() => {
        state.searchQuery = els.searchInput.value;
        state.page = 1;
        renderTable();
      }, 300)
    );
  }

  /* ------------------------------------------------------------------ */
  /* 9) مودال إضافة مصروف                                                */
  /* ------------------------------------------------------------------ */
  function openAddModal() {
    // Reset form
    if (els.expTypeSelect) els.expTypeSelect.value = "";
    if (els.expAmountInput) els.expAmountInput.value = "";
    if (els.expDescInput) els.expDescInput.value = "";
    if (els.expNotesInput) els.expNotesInput.value = "";

    // Update balance display
    updateBalanceDisplay();

    // Update info row
    const now = new Date();
    if (els.infoDate) {
      els.infoDate.textContent = `${now.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })}, ${now.toLocaleTimeString("ar-EG", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
    if (els.infoCashier) els.infoCashier.textContent = "أحمد محمد";
    if (els.infoShift) els.infoShift.textContent = "# SHF-1024";

    els.addOverlay.style.display = "flex";
  }

  function closeAddModal() {
    els.addOverlay.style.display = "none";
  }

  function updateBalanceDisplay() {
    const amount = parseFloat(els.expAmountInput?.value) || 0;
    if (els.balanceAvailable)
      els.balanceAvailable.textContent = `${formatMoney(state.availableCash)} EGP`;
    if (els.balanceAfter)
      els.balanceAfter.textContent = `${formatMoney(state.availableCash - amount)} EGP`;
  }

  if (els.addBtn) els.addBtn.addEventListener("click", openAddModal);
  if (els.closeAddBtn) els.closeAddBtn.addEventListener("click", closeAddModal);
  if (els.cancelAddBtn)
    els.cancelAddBtn.addEventListener("click", closeAddModal);
  if (els.addOverlay) {
    els.addOverlay.addEventListener("click", (e) => {
      if (e.target === els.addOverlay) closeAddModal();
    });
  }

  if (els.expAmountInput) {
    els.expAmountInput.addEventListener("input", updateBalanceDisplay);
  }

  /* ------------------------------------------------------------------ */
  /* 10) تأكيد إضافة المصروف                                             */
  /* ------------------------------------------------------------------ */
  if (els.confirmAddBtn) {
    els.confirmAddBtn.addEventListener("click", async () => {
      const type = els.expTypeSelect?.value;
      const amount = parseFloat(els.expAmountInput?.value) || 0;
      const desc = els.expDescInput?.value?.trim();

      // Validate
      if (!type) {
        showToast("اختر نوع المصروف", "error");
        return;
      }
      if (!amount || amount <= 0) {
        showToast("أدخل مبلغ صحيح", "error");
        return;
      }
      if (!desc) {
        showToast("أدخل وصف المصروف", "error");
        return;
      }
      if (amount > state.availableCash) {
        showToast("المبلغ أكبر من النقدية المتاحة!", "error");
        return;
      }

      els.confirmAddBtn.disabled = true;
      try {
        const shiftId = state.currentShift?.id || state.currentShift?.shift_id;
        const response = await api.post("/api/v1/expenses", { expense_type_id: type, shift_id: shiftId, amount, description: desc, notes: els.expNotesInput?.value?.trim() || null, idempotency_key: idempotencyKey() });
        const newExpense = normalizeExpense(response?.expense || response?.data || response);
        closeAddModal(); showSuccessModal(newExpense); await loadExpenses();
      } catch (error) { showToast(error.message, "error"); }
      finally { els.confirmAddBtn.disabled = false; }
    });
  }

  /* ------------------------------------------------------------------ */
  /* 11) مودال النجاح                                                    */
  /* ------------------------------------------------------------------ */
  function showSuccessModal(expense) {
    const { time } = formatDate(expense.date);
    if (els.successRefNo) els.successRefNo.textContent = `#${expense.id}`;
    if (els.successType) els.successType.textContent = expense.type;
    if (els.successAmount) els.successAmount.textContent = `${expense.amount} جنيه`;
    if (els.successTime) els.successTime.textContent = time;
    if (els.successShift) els.successShift.textContent = "وردية #2";
    if (els.successOverlay) els.successOverlay.style.display = "flex";
  }

  function closeSuccessModal() {
    if (els.successOverlay) els.successOverlay.style.display = "none";
  }

  if (els.closeSuccessBtn)
    els.closeSuccessBtn.addEventListener("click", closeSuccessModal);
  if (els.successOverlay) {
    els.successOverlay.addEventListener("click", (e) => {
      if (e.target === els.successOverlay) closeSuccessModal();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */
  renderStats();
  renderTable();
  loadExpenseTypes();
  loadExpenses();
})();
