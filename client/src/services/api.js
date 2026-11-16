// All server calls go through here. Uses the browser's built-in fetch.
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

export const getToken = () => safe(() => localStorage.getItem("t"), null);
export const getUser = () => safe(() => JSON.parse(localStorage.getItem("u")), null);
export const saveSession = ({ token, user }) => safe(() => { localStorage.setItem("t", token); localStorage.setItem("u", JSON.stringify(user)); });
export const clearSession = () => safe(() => { localStorage.removeItem("t"); localStorage.removeItem("u"); });

export async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch("/api" + path, { method, headers, body: form || (body && JSON.stringify(body)) });

  if (res.status === 401 && token) { // token expired or user removed
    clearSession();
    window.dispatchEvent(new Event("auth:expired"));
    throw new Error("Session expired. Please log in again.");
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error((data && data.error) || "Something went wrong"), { status: res.status, data });
  return data;
}

// the prescription photo needs the login token, so it is fetched as a blob
export async function fetchImageUrl(path) {
  const res = await fetch("/api" + path, { headers: { Authorization: "Bearer " + getToken() } });
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}
