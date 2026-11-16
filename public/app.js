/* shared helpers for every page */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// escape anything that came from the server before putting it in innerHTML
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};
const me = () => { try { return JSON.parse(store.get("u")); } catch { return null; } };
const fmtTime = (d) => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function api(path, { method = "GET", body, form } = {}) {
  const h = {}, t = store.get("t");
  if (t) h.Authorization = "Bearer " + t;
  if (body) h["Content-Type"] = "application/json";
  const r = await fetch("/api" + path, { method, headers: h, body: form || (body && JSON.stringify(body)) });
  if (r.status === 401 && t) { logout(); throw new Error("Session expired"); }
  const d = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error((d && d.error) || "Something went wrong"), { status: r.status, data: d });
  return d;
}

function setSession(d) { store.set("t", d.token); store.set("u", JSON.stringify(d.user)); }
function logout() { store.del("t"); store.del("u"); location.href = "login.html"; }

// returns true if allowed; otherwise redirects
function requireLogin(role) {
  const u = me();
  if (!u) { location.href = "login.html?next=" + encodeURIComponent(location.pathname + location.search); return false; }
  if (role && u.role !== role) { location.href = "dashboard.html"; return false; }
  return true;
}

function toast(msg, bad) {
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " bad" : "");
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 4000);
}

/* ---- request journey: draws the steps from a request's history ---- */
function stepsHtml(steps) {
  return `<div class="steps" style="--n:${steps.length}">${steps.map((s, i) =>
    `<div class="st ${s.state}"><i>${s.state === "done" ? "✓" : s.state === "bad" ? "✕" : i + 1}</i><b>${esc(s.label)}</b>${esc(s.detail || "")}</div>`).join("")}</div>`;
}
function rxSteps(p) {
  const at = (s) => { const h = p.history.find((x) => x.step === s); return h ? fmtTime(h.at) : ""; };
  const st = p.status;
  const rank = { uploaded: 1, ai_read: 2, sent: 3, reviewing: 3, approved: 3, rejected: 3, ready: 4, collected: 5 }[st];
  const review = { sent: "Waiting for staff", reviewing: "In progress", approved: "Approved", rejected: "Rejected" }[st] || at("reviewing");
  const L = [
    ["Uploaded", at("uploaded")],
    ["AI read", p.medicines.length ? p.medicines.length + " medicines" : "Enter manually"],
    ["Staff reviewing", review],
    ["Ready for pickup", at("ready")],
    ["Collected", at("collected")],
  ];
  return L.map(([label, detail], i) => ({
    label, detail,
    state: st === "collected" || i + 1 < rank ? "done" : i + 1 === rank ? (st === "rejected" ? "bad" : "now") : "todo",
  }));
}
function aptSteps(a) {
  const at = (s) => { const h = a.history.find((x) => x.step === s); return h ? fmtTime(h.at) : ""; };
  if (a.status === "cancelled") return [{ label: "Booked", detail: at("booked"), state: "done" }, { label: "Cancelled", detail: at("cancelled"), state: "bad" }];
  const rank = { booked: 1, confirmed: 2, completed: 3 }[a.status];
  return [["Booked", "booked"], ["Confirmed", "confirmed"], ["Consultation done", "completed"]].map(([label, s], i) => ({
    label, detail: at(s), state: a.status === "completed" || i + 1 < rank ? "done" : i + 1 === rank ? "now" : "todo",
  }));
}

/* ---- navbar: shows name, alerts bell and logout once logged in ---- */
function initNav() {
  const nr = $(".nr"), u = me();
  if (!nr || !u) return;
  nr.innerHTML = `<span class="sos">Emergency: 108</span>
    <div class="bellw"><button class="btn" id="bell" aria-label="Notifications">Alerts <span id="bc" class="cnt" hidden></span></button><div id="bl" class="bl" hidden></div></div>
    <a class="btn" href="${u.role === "staff" ? "staff.html" : "dashboard.html"}">${esc(u.name.split(" ")[0])}</a>
    <button class="btn p" id="out">Logout</button>`;
  $("#out").onclick = logout;
  const bl = $("#bl");
  const load = async () => {
    try {
      const list = await api("/notifications");
      const unread = list.filter((n) => !n.read).length;
      $("#bc").hidden = !unread; $("#bc").textContent = unread;
      bl.innerHTML = list.length ? list.slice(0, 8).map((n) =>
        `<div class="ni${n.read ? "" : " un"}" data-id="${esc(n._id)}">${esc(n.message)}<small>${fmtTime(n.sendAt)}</small></div>`).join("") : '<div class="ni">No alerts yet</div>';
    } catch {}
  };
  $("#bell").onclick = () => { bl.hidden = !bl.hidden; };
  bl.onclick = async (e) => {
    const n = e.target.closest(".ni[data-id]");
    if (n && n.classList.contains("un")) { await api(`/notifications/${n.dataset.id}/read`, { method: "PATCH" }).catch(() => {}); load(); }
  };
  document.addEventListener("click", (e) => { if (!e.target.closest(".bellw")) bl.hidden = true; });
  load();
  setInterval(load, 60000);
}

/* ---- Concierge chat box ---- */
function initChat(box) {
  const log = $(".log", box), form = $("form", box), input = $("input", form);
  const history = [];
  const add = (who, text) => {
    const d = document.createElement("div");
    d.className = "bub " + (who === "me" ? "me" : "ai");
    d.textContent = text;
    log.append(d); log.scrollTop = log.scrollHeight;
    return d;
  };
  add("ai", "Hi, I'm the Hospital Concierge. Tell me what you're feeling and I'll suggest a department and find you a slot. I can't diagnose or suggest medicines.");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (!me()) { add("ai", "Please log in first so I can book for you."); return; }
    input.value = ""; add("me", text); history.push({ role: "user", text });
    const wait = add("ai", "Thinking…");
    try {
      const r = await api("/concierge", { method: "POST", body: { messages: history } });
      wait.textContent = r.reply; history.push({ role: "model", text: r.reply });
      if (r.emergency) wait.classList.add("emg");
    } catch (err) { wait.textContent = err.message; history.pop(); }
    log.scrollTop = log.scrollHeight;
  };
}

document.addEventListener("DOMContentLoaded", initNav);
