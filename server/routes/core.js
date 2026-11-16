// auth, departments, doctors, appointments
const r = require("express").Router();
const bcrypt = require("bcryptjs");
const { User, Department, Doctor, Appointment, Notification } = require("../models");
const { sign, auth, requireRole, setStatus, wrap, freeSlots, bookSlot, makeReminders, rateLimit } = require("../lib");

const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;
const bad = (res, m) => res.status(400).json({ error: m });
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const registerLimit = rateLimit(20, 15 * 60 * 1000);
const loginLimit = rateLimit(20, 15 * 60 * 1000, { skipOk: true }); // only failed logins count, so a shared IP can still log in

// staff-supplied availability: weekday 0-6, HH:MM times, start before end
function cleanAvailability(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const a of list.slice(0, 14)) {
    if (!a || !Number.isInteger(a.weekday) || a.weekday < 0 || a.weekday > 6 || !TIME.test(a.start || "") || !TIME.test(a.end || "") || a.start >= a.end) return null;
    out.push({ weekday: a.weekday, start: a.start, end: a.end });
  }
  return out;
}
function doctorBody(body, res) {
  const d = pick(body, ["name", "department", "qualification", "experienceYears", "fee", "availability"]);
  if (d.availability !== undefined && !(d.availability = cleanAvailability(d.availability))) { bad(res, "availability must be weekday 0-6 with start < end as HH:MM"); return null; }
  if (d.fee !== undefined && !(Number(d.fee) >= 0)) { bad(res, "fee must be a number"); return null; }
  return d;
}

/* ---- module 1: auth ---- */
r.post("/auth/register", registerLimit, wrap(async (req, res) => {
  const name = str(req.body.name, 100), email = str(req.body.email, 200).toLowerCase(), phone = str(req.body.phone, 20), password = req.body.password;
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, "A name and a valid email are required");
  // bcrypt only uses the first 72 bytes, so longer passwords are refused instead of silently cut
  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password) > 72) return bad(res, "Password must be 8 to 72 characters");
  if (await User.findOne({ email })) return res.status(409).json({ error: "Email already registered" });
  // role is never read from the body: public sign-up is always a patient
  const u = await User.create({ name, email, phone, password: await bcrypt.hash(password, 10), role: "patient" });
  res.status(201).json({ token: sign(u), user: { id: u.id, name: u.name, role: u.role } });
}));

r.post("/auth/login", loginLimit, wrap(async (req, res) => {
  const u = await User.findOne({ email: String(req.body.email || "").toLowerCase() });
  if (!u || !(await bcrypt.compare(String(req.body.password || ""), u.password)))
    return res.status(401).json({ error: "Wrong email or password" });
  res.json({ token: sign(u), user: { id: u.id, name: u.name, role: u.role } });
}));

/* ---- module 2: departments + doctors (writes are staff-only) ---- */
r.get("/departments", wrap(async (_q, res) => res.json(await Department.find().sort("name"))));
r.post("/departments", requireRole("staff"), wrap(async (req, res) =>
  res.status(201).json(await Department.create(pick(req.body, ["name", "description"])))));
r.put("/departments/:id", requireRole("staff"), wrap(async (req, res) =>
  res.json(await Department.findByIdAndUpdate(req.params.id, pick(req.body, ["name", "description"]), { returnDocument: "after", runValidators: true }))));
r.delete("/departments/:id", requireRole("staff"), wrap(async (req, res) => {
  if (await Doctor.exists({ department: req.params.id })) return res.status(409).json({ error: "Department has doctors" });
  await Department.findByIdAndDelete(req.params.id);
  res.status(204).end();
}));

r.get("/doctors", wrap(async (req, res) => {
  const q = req.query.department ? { department: String(req.query.department) } : {};
  res.json(await Doctor.find(q).populate("department", "name").sort("name"));
}));
r.get("/doctors/:id", wrap(async (req, res) => {
  const d = await Doctor.findById(req.params.id).populate("department", "name");
  d ? res.json(d) : res.status(404).json({ error: "Not found" });
}));
r.get("/doctors/:id/slots", wrap(async (req, res) => {
  if (!DATE.test(req.query.date || "")) return bad(res, "date=YYYY-MM-DD required");
  const s = await freeSlots(req.params.id, req.query.date);
  s ? res.json(s) : res.status(404).json({ error: "Doctor not found" });
}));
r.post("/doctors", requireRole("staff"), wrap(async (req, res) => {
  const d = doctorBody(req.body, res); if (!d) return;
  res.status(201).json(await Doctor.create(d));
}));
r.put("/doctors/:id", requireRole("staff"), wrap(async (req, res) => {
  const d = doctorBody(req.body, res); if (!d) return;
  const out = await Doctor.findByIdAndUpdate(req.params.id, d, { returnDocument: "after", runValidators: true });
  out ? res.json(out) : res.status(404).json({ error: "Not found" });
}));
r.delete("/doctors/:id", requireRole("staff"), wrap(async (req, res) => {
  if (await Appointment.exists({ doctor: req.params.id, active: true })) return res.status(409).json({ error: "Doctor has active appointments" });
  await Doctor.findByIdAndDelete(req.params.id);
  res.status(204).end();
}));

/* ---- module 3: appointments ---- */
r.post("/appointments", auth, wrap(async (req, res) => {
  const { doctor, date, time, reason } = req.body;
  if (!doctor || !DATE.test(date || "") || !TIME.test(time || "")) return bad(res, "doctor, date, time required");
  const a = await bookSlot({ patientId: req.user.id, doctorId: String(doctor), date, time, reason: str(reason, 200) });
  res.status(201).json(a);
}));

// patients see their own; staff see all
r.get("/appointments", auth, wrap(async (req, res) => {
  const q = req.user.role === "staff" ? {} : { patient: req.user.id };
  res.json(await Appointment.find(q).populate("doctor", "name").populate("patient", "name").sort("-createdAt"));
}));

async function mine(req, res) {
  const a = await Appointment.findById(req.params.id);
  if (!a || (req.user.role !== "staff" && String(a.patient) !== req.user.id)) {
    res.status(404).json({ error: "Not found" });
    return null;
  }
  return a;
}

r.patch("/appointments/:id/cancel", auth, wrap(async (req, res) => {
  const a = await mine(req, res); if (!a) return;
  if (!a.active) return bad(res, "Already cancelled");
  if (a.status === "completed") return bad(res, "A completed appointment cannot be cancelled");
  a.active = false; // frees the slot for rebooking
  setStatus(a, "cancelled", req.user.id);
  await a.save();
  await Notification.deleteMany({ ref: `appt:${a.id}`, sent: false });
  res.json(a);
}));

r.patch("/appointments/:id/reschedule", auth, wrap(async (req, res) => {
  const a = await mine(req, res); if (!a) return;
  const { date, time } = req.body;
  if (!a.active || a.status === "completed") return bad(res, "This appointment cannot be rescheduled");
  if (!DATE.test(date || "") || !TIME.test(time || "")) return bad(res, "date, time required");
  const free = await freeSlots(a.doctor, date);
  if (!free || !free.includes(time)) return res.status(409).json({ error: "Slot not available" });
  a.date = date; a.time = time;
  setStatus(a, "booked", req.user.id, `rescheduled to ${date} ${time}`);
  try { await a.save(); } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: "Slot already booked" });
    throw e;
  }
  // old reminders pointed at the old time
  await Notification.deleteMany({ ref: `appt:${a.id}`, sent: false });
  await makeReminders(a);
  res.json(a);
}));

// staff move booked -> confirmed -> completed
r.patch("/appointments/:id/status", requireRole("staff"), wrap(async (req, res) => {
  const { status } = req.body;
  if (!["confirmed", "completed"].includes(status)) return bad(res, "status must be confirmed or completed");
  const a = await Appointment.findById(req.params.id);
  if (!a || !a.active) return res.status(404).json({ error: "Not found" });
  setStatus(a, status, req.user.id);
  await a.save();
  res.json(a);
}));

module.exports = r;
