export const fmtTime = (d) => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

// local calendar date as YYYY-MM-DD (toISOString would give the UTC date)
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// where to go after login: only same-site paths like "/pharmacy?id=1".
// Rejects "//evil.com", "/\evil.com" and anything with a scheme (open-redirect guard).
export const safeNext = (next) => (typeof next === "string" && /^\/(?![/\\])[\w\-./?=&%#]*$/.test(next) ? next : "/");
