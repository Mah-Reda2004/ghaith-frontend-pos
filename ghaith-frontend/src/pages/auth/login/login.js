import { bindThemeToggle, initTheme } from "../../../core/theme.js";
import { getHomeUrl, login } from "../../../core/auth.js";

const REMEMBER_KEY = "ghaith-remembered-username";
const form = document.getElementById("loginForm");
const usernameInput = document.getElementById("loginUsername");
const passwordInput = document.getElementById("loginPassword");
const rememberInput = document.getElementById("rememberUsername");
const passwordToggle = document.getElementById("passwordToggle");
const submitButton = document.getElementById("loginSubmit");
const alertBox = document.getElementById("loginAlert");
const alertText = document.getElementById("loginAlertText");

initTheme();
bindThemeToggle(document.getElementById("loginThemeToggle"));
document.getElementById("currentYear").textContent = new Date().getFullYear();

const rememberedUsername = localStorage.getItem(REMEMBER_KEY);
if (rememberedUsername) {
  usernameInput.value = rememberedUsername;
  rememberInput.checked = true;
  passwordInput.focus();
} else {
  usernameInput.focus();
}

function setFieldError(input, messageElement, hasError) {
  input.setAttribute("aria-invalid", String(hasError));
  messageElement.hidden = !hasError;
}

function hideAlert() {
  alertBox.hidden = true;
  alertBox.classList.remove("is-info");
}

function showAlert(message) {
  alertText.textContent = message;
  alertBox.hidden = false;
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.classList.toggle("is-loading", isLoading);
  submitButton.querySelector(".login-submit__label").textContent = isLoading ? "جاري تسجيل الدخول..." : "تسجيل الدخول";
  usernameInput.readOnly = isLoading;
  passwordInput.readOnly = isLoading;
}

function validateForm() {
  const usernameMissing = !usernameInput.value.trim();
  const passwordMissing = !passwordInput.value;
  setFieldError(usernameInput, document.getElementById("usernameError"), usernameMissing);
  setFieldError(passwordInput, document.getElementById("passwordError"), passwordMissing);
  if (usernameMissing) usernameInput.focus();
  else if (passwordMissing) passwordInput.focus();
  return !usernameMissing && !passwordMissing;
}

usernameInput.addEventListener("input", () => {
  setFieldError(usernameInput, document.getElementById("usernameError"), false);
  hideAlert();
});

passwordInput.addEventListener("input", () => {
  setFieldError(passwordInput, document.getElementById("passwordError"), false);
  hideAlert();
});

passwordToggle.addEventListener("click", () => {
  const showPassword = passwordInput.type === "password";
  passwordInput.type = showPassword ? "text" : "password";
  passwordToggle.setAttribute("aria-pressed", String(showPassword));
  passwordToggle.setAttribute("aria-label", showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
  passwordInput.focus();
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  hideAlert();
  if (!validateForm()) return;

  const credentials = {
    username: usernameInput.value.trim(),
    password: passwordInput.value,
    remember: rememberInput.checked
  };

  if (rememberInput.checked) localStorage.setItem(REMEMBER_KEY, credentials.username);
  else localStorage.removeItem(REMEMBER_KEY);

  setLoading(true);
  try {
    const user = await login(credentials);
    window.location.href = getHomeUrl(user, true);
  } catch (error) {
    showAlert(error?.message || "تعذّر تسجيل الدخول. تأكد من البيانات وحاول مرة أخرى.");
  } finally {
    setLoading(false);
  }
});

document.getElementById("forgotPassword").addEventListener("click", () => {
  showAlert("تواصل مع مسؤول النظام لإعادة تعيين كلمة المرور.");
});

document.getElementById("supportButton").addEventListener("click", () => {
  showAlert("يرجى التواصل مع مدير النظام أو الدعم الفني الخاص بالمتجر.");
});
