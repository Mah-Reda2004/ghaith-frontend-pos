import { api, clearTokens, getAccessToken, saveTokens } from "./api.js";

const CURRENT_USER_KEY = "ghaith-current-user";

function userStore() {
  return localStorage.getItem("ghaith-persist-session") === "1" ? localStorage : sessionStorage;
}

export function getCurrentUser() {
  const source = sessionStorage.getItem(CURRENT_USER_KEY) || localStorage.getItem(CURRENT_USER_KEY);
  try { return source ? JSON.parse(source) : null; } catch { return null; }
}

function decodeAccessToken() {
  try {
    const payload = getAccessToken()?.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(decodeURIComponent(Array.from(atob(base64), character => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")));
  } catch { return null; }
}

export function getUserRole(user = getCurrentUser()) {
  const profile = user?.user || user?.data || user?.profile || user;
  const token = decodeAccessToken();
  const candidates = [
    profile?.roles?.slug, profile?.roles?.code, profile?.roles?.name, profile?.roles,
    profile?.role?.slug, profile?.role?.code, profile?.role?.name, profile?.role,
    profile?.role_name, profile?.role_code, profile?.user_role, profile?.type,
    token?.role, token?.role_name, token?.role_code, token?.user_role
  ];
  const value = candidates.find(candidate => typeof candidate === "string" && candidate.trim());
  const normalized = String(value || "").trim().toLowerCase();
  if (["admin", "administrator", "superadmin", "super_admin", "مدير", "مدير النظام"].includes(normalized)) return "admin";
  if (["cashier", "كاشير"].includes(normalized)) return "cashier";
  if (["sales", "salesperson", "sales_person", "بائع", "مبيعات"].includes(normalized)) return "sales";
  return normalized;
}

export function getHomeUrl(user, fromLogin = false) {
  const prefix = fromLogin ? "../../" : "../";
  const role = getUserRole(user);
  if (role === "admin") return `${prefix}admin/admin.html`;
  if (role === "cashier" || role === "sales") return `${prefix}cashier/cashier.html`;
  throw new Error("تعذّر تحديد صلاحية الحساب. تواصل مع مسؤول النظام.");
}

export async function login({ username, password, remember = false }) {
  const tokens = await api.post("/api/v1/auth/login", { username, password }, { auth: false });
  saveTokens(tokens, remember);
  try {
    const response = await api.get("/api/v1/users/me");
    const user = response?.user || response?.data || response?.profile || response;
    userStore().setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  } catch (error) {
    logout();
    throw error;
  }
}

export function logout() {
  clearTokens();
  localStorage.removeItem(CURRENT_USER_KEY);
  sessionStorage.removeItem(CURRENT_USER_KEY);
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}

export const GhaithAuth = { login, logout, getCurrentUser, getUserRole, getHomeUrl, isAuthenticated };
