const jwt = require("jsonwebtoken");
const { User, Doctor, Appointment, Notification } = require("./models");

const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET not set");
  return process.env.JWT_SECRET;
};
const sign = (u) => jwt.sign({ id: u.id, role: u.role }, secret(), { expiresIn: "7d" });

// attaches req.user = {id, role}; 401 otherwise.
// Role comes from the database, not the token, so a deleted or demoted user loses access at once.
async function auth(req, res, next) {
  try {
    const t = jwt.verify((req.headers.authorization || "").replace(/^Bearer /, ""), secret());
    const u = await User.findById(t.id).select("role");
    if (!u) throw new Error("no such user");
    req.user = { id: u.id, role: u.role };
    next();
  } catch {
    res.status(401).json({ error: "Login required" });
  }
}

// in-memory limiter: max requests per window, per user (or IP before login)
// ponytail: per-process memory, use a shared store (Redis) if you run several servers
function rateLimit(max, windowMs, { skipOk = false } = {}) { // skipOk: only failed requests (status >= 400) count
  const hits = new Map();
  return (req, res, next) => {
    const key = (req.user && req.user.id) || req.ip, now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return res.status(429).json({ error: "Too many requests. Please try again later." });
    recent.push(now);
    hits.set(key, recent);
    if (skipOk) res.on("finish", () => { if (res.statusCode < 400) recent.pop(); });
    if (hits.size > 5000) hits.clear(); // keeps memory bounded
    next();
  };
}
const requireRole = (role) => [auth, (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: "Not allowed" })];

// every status change goes through here so history is always written
function setStatus(doc, step, byUserId, note) {
  doc.status = step;
  doc.history.push({ step, by: byUserId, note });
}

// async route wrapper -> errors reach the error handler
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const SLOT_MIN = 15;
const pad = (n) => String(n).padStart(2, "0");
// local calendar date (toISOString would give the UTC date: wrong in IST before 05:30)
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// free 15-min slots for a doctor on YYYY-MM-DD
async function freeSlots(doctorId, date) {
  const doc = await Doctor.findById(doctorId);
  if (!doc) return null;
  const weekday = new Date(date + "T00:00:00").getDay();
  const taken = new Set((await Appointment.find({ doctor: doctorId, date, active: true })).map((a) => a.time));
  const out = [];
  for (const a of doc.availability.filter((x) => x.weekday === weekday))
    for (let m = toMin(a.start); m + SLOT_MIN <= toMin(a.end); m += SLOT_MIN)
      if (!taken.has(fmt(m)) && new Date(`${date}T${fmt(m)}:00`) > new Date()) out.push(fmt(m)); // no past slots
  return out.sort();
}

// confirmation now + reminders 1 day and 1 hour before (only if still in the future)
async function makeReminders(appt) {
  const { date, time } = appt;
  const when = new Date(`${date}T${time}:00`);
  const ref = `appt:${appt.id}`;
  const msg = (t) => `Appointment ${t} on ${date} at ${time}`;
  const rows = [{ message: msg("confirmed"), sendAt: new Date() }];
  const dayBefore = new Date(when - 24 * 3600e3), hourBefore = new Date(when - 3600e3);
  if (dayBefore > new Date()) rows.push({ message: "Reminder: " + msg("tomorrow"), sendAt: dayBefore });
  if (hourBefore > new Date()) rows.push({ message: "Reminder: " + msg("in 1 hour"), sendAt: hourBefore });
  await Notification.insertMany(rows.map((r) => ({ ...r, user: appt.patient, ref })));
}

// create booking + reminders. Shared by the REST route and the Concierge tool.
async function bookSlot({ patientId, doctorId, date, time, reason }) {
  const free = await freeSlots(doctorId, date);
  if (!free) throw Object.assign(new Error("Doctor not found"), { status: 404 });
  if (!free.includes(time)) throw Object.assign(new Error("Slot not available"), { status: 409 });
  const appt = new Appointment({ patient: patientId, doctor: doctorId, date, time, reason });
  setStatus(appt, "booked", patientId);
  try {
    await appt.save();
  } catch (e) {
    if (e.code === 11000) throw Object.assign(new Error("Slot already booked"), { status: 409 });
    throw e;
  }
  await makeReminders(appt);
  return appt;
}

// Gemini says 503/429 when busy; retry a few times with a growing pause
async function withRetry(fn, tries = 4) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      const busy = e.status === 503 || e.status === 429;
      if (!busy || i >= tries) throw busy ? Object.assign(new Error("The AI is busy right now. Please try again in a minute."), { status: 503 }) : e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

module.exports = { rateLimit, withRetry, sign, auth, requireRole, setStatus, wrap, freeSlots, bookSlot, makeReminders, localDate };
