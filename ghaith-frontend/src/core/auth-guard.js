(function guardProtectedPage() {
  const accessTokenKey = "ghaith-access-token";
  const currentUserKey = "ghaith-current-user";
  const loginUrl = new URL("../pages/auth/login/login.html", document.currentScript.src).href;

  function redirectToLogin() {
    if (window.location.href === loginUrl) return;
    document.documentElement.style.display = "none";
    window.location.replace(loginUrl);
  }

  const hasSession = sessionStorage.getItem(accessTokenKey) || localStorage.getItem(accessTokenKey);
  if (!hasSession) {
    localStorage.removeItem(currentUserKey);
    sessionStorage.removeItem(currentUserKey);
    redirectToLogin();
  }

  window.addEventListener("ghaith:session-expired", redirectToLogin);
}());
