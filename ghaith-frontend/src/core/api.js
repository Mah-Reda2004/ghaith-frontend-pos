const API_BASE_URL = "https://test-3f530955.fastapicloud.dev";
const ACCESS_TOKEN_KEY = "ghaith-access-token";
const REFRESH_TOKEN_KEY = "ghaith-refresh-token";
const PERSIST_SESSION_KEY = "ghaith-persist-session";

function getSessionStore() {
  return localStorage.getItem(PERSIST_SESSION_KEY) === "1" ? localStorage : sessionStorage;
}

function readToken(key) {
  return sessionStorage.getItem(key) || localStorage.getItem(key);
}

export function getAccessToken() {
  return readToken(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return readToken(REFRESH_TOKEN_KEY);
}

export function saveTokens(tokens, persist = false) {
  clearTokens();
  const store = persist ? localStorage : sessionStorage;
  store.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  store.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  if (persist) localStorage.setItem(PERSIST_SESSION_KEY, "1");
}

export function clearTokens() {
  [localStorage, sessionStorage].forEach(store => {
    store.removeItem(ACCESS_TOKEN_KEY);
    store.removeItem(REFRESH_TOKEN_KEY);
  });
  localStorage.removeItem(PERSIST_SESSION_KEY);
}

function buildUrl(path, query) {
  const url = new URL(path, API_BASE_URL);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  return url;
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

function getErrorMessage(response, data) {
  if (Array.isArray(data?.detail)) return data.detail.map(item => item.msg).filter(Boolean).join("، ");
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.error?.message === "string") return data.error.message;
  if (typeof data?.message === "string") return data.message;
  if (response.status === 401) return "اسم المستخدم أو كلمة المرور غير صحيحة.";
  if (response.status === 403) return "ليس لديك صلاحية لتنفيذ هذا الإجراء.";
  if (response.status === 429) return "عدد الطلبات كبير حالياً. انتظر لحظات ثم حاول مرة أخرى.";
  if (response.status >= 500) return "حدث خطأ في الخادم. حاول مرة أخرى لاحقاً.";
  return "تعذّر إكمال الطلب.";
}

function retryDelay(response, attempt) {
  const retryAfter = response.headers.get("Retry-After");
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 5000);
  const date = Date.parse(retryAfter || "");
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 5000);
  return 500 * (attempt + 1);
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  let response;
  try {
    response = await fetch(buildUrl("/api/v1/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
  } catch {
    return false;
  }

  if (!response.ok) {
    clearTokens();
    return false;
  }

  const tokens = await response.json();
  saveTokens(tokens, localStorage.getItem(PERSIST_SESSION_KEY) === "1");
  return true;
}

export async function apiRequest(path, options = {}) {
  const { query, auth = true, retry = true, rateLimitAttempt = 0, headers: customHeaders, body, ...fetchOptions } = options;
  const headers = new Headers(customHeaders || {});
  headers.set("Accept", "application/json");
  if (body !== undefined && !(body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (auth && getAccessToken()) headers.set("Authorization", `Bearer ${getAccessToken()}`);

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...fetchOptions,
      headers,
      body: body === undefined || body instanceof FormData ? body : JSON.stringify(body)
    });
  } catch {
    throw new Error("تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.");
  }

  if (response.status === 401 && auth && retry && await refreshAccessToken()) {
    return apiRequest(path, { ...options, retry: false });
  }

  if (response.status === 429 && (fetchOptions.method || "GET") === "GET" && rateLimitAttempt < 2) {
    await wait(retryDelay(response, rateLimitAttempt));
    return apiRequest(path, { ...options, rateLimitAttempt: rateLimitAttempt + 1 });
  }

  if (response.status === 401 && auth) {
    clearTokens();
    window.dispatchEvent(new CustomEvent("ghaith:session-expired"));
  }

  const data = await parseResponse(response);
  if (!response.ok) {
    const error = new Error(getErrorMessage(response, data));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  get: (path, options = {}) => apiRequest(path, { ...options, method: "GET" }),
  post: (path, body, options = {}) => apiRequest(path, { ...options, method: "POST", body }),
  patch: (path, body, options = {}) => apiRequest(path, { ...options, method: "PATCH", body }),
  delete: (path, options = {}) => apiRequest(path, { ...options, method: "DELETE" })
};

export function listFrom(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.data?.items)) return response.data.items;
  if (Array.isArray(response?.results)) return response.results;
  return Array.isArray(response?.data) ? response.data : [];
}

export function idempotencyKey() {
  return crypto.randomUUID();
}

export { API_BASE_URL };
