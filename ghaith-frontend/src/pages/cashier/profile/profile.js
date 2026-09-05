(function initProfilePage() {
  const showAllButton = document.getElementById("profileShowAll");
  const profileName = document.querySelector("[data-profile-name]");
  const loggedInName = document.getElementById("cashierUserMenu")?.dataset.userName;

  if (profileName && loggedInName) profileName.textContent = loggedInName;
  if (!showAllButton) return;

  showAllButton.addEventListener("click", () => {
    if (document.documentElement.dataset.cashierSpa === "true") {
      window.location.hash = "invoices";
      return;
    }
    window.location.href = "../cashier.html#invoices";
  });
})();
