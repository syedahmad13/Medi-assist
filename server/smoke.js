// node smoke.js : end-to-end check against an in-memory MongoDB (no keys needed)
const assert = require("assert/strict");
process.env.JWT_SECRET = "test-secret";
process.env.SEED_STAFF_EMAIL = "staff@test.dev";
process.env.SEED_STAFF_PASSWORD = "staffpass123";
// empty (not deleted) so dotenv inside index.js cannot refill them from the real .env
for (const k of ["GEMINI_API_KEY", "SMTP_URL", "MONGO_URI"]) process.env[k] = "";

(async () => {
  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongoose = require("mongoose");
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const { Appointment, User } = require("./models");
  await Appointment.init();
  await require("./seed")();

  const server = require("./index").listen(0);
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, url, { token, body, form } = {}) => {
    const r = await fetch(base + url, {
      method,
      headers: { ...(token && { Authorization: "Bearer " + token }), ...(body && { "Content-Type": "application/json" }) },
      body: form || (body && JSON.stringify(body)),
    });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };

  let n = 0; const ok = (m) => console.log(`ok ${++n} ${m}`);

  // auth
  const reg = await call("POST", "/api/auth/register", { body: { name: "Asha", email: "asha@test.dev", password: "password123", role: "staff" } });
  assert.equal(reg.status, 201); assert.equal(reg.json.user.role, "patient"); ok("register ignores role=staff in body");
  const pt = reg.json.token;
  assert.equal((await call("POST", "/api/auth/register", { body: { name: "x", email: "asha@test.dev", password: "password123" } })).status, 409); ok("duplicate email 409");
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "asha@test.dev", password: "wrong" } })).status, 401); ok("bad password 401");
  const st = (await call("POST", "/api/auth/login", { body: { email: "staff@test.dev", password: "staffpass123" } })).json.token;
  assert.ok(st); ok("staff login (seeded)");

  // role checks
  const deps = (await call("GET", "/api/departments")).json;
  assert.equal(deps.length, 6);
  assert.equal((await call("POST", "/api/doctors", { token: pt, body: { name: "X", department: deps[0]._id } })).status, 403); ok("patient cannot create doctor");
  assert.equal((await call("POST", "/api/doctors")).status, 401); ok("no token 401");

  // staff CRUD
  const cardio = deps.find((d) => d.name === "Cardiology");
  const doc = (await call("POST", "/api/doctors", { token: st, body: { name: "Dr. Test", department: cardio._id, fee: 500, availability: [{ weekday: 1, start: "10:00", end: "11:00" }] } })).json;
  assert.ok(doc._id); ok("staff creates doctor");
  assert.equal((await call("PUT", `/api/doctors/${doc._id}`, { token: st, body: { fee: 600 } })).json.fee, 600); ok("staff updates doctor");

  // departments CRUD
  const dep = await call("POST", "/api/departments", { token: st, body: { name: "Neurology", description: "Brain and nerves" } });
  assert.equal(dep.status, 201); ok("staff creates department");
  assert.equal((await call("POST", "/api/departments", { token: st, body: { name: "Neurology" } })).status, 409); ok("duplicate department name 409");
  assert.equal((await call("POST", "/api/departments", { token: pt, body: { name: "Nope" } })).status, 403); ok("patient cannot create department");
  assert.equal((await call("PUT", `/api/departments/${dep.json._id}`, { token: st, body: { description: "Neuro care" } })).json.description, "Neuro care"); ok("staff edits department");
  assert.equal((await call("DELETE", `/api/departments/${cardio._id}`, { token: st })).status, 409); ok("department with doctors cannot be deleted");
  assert.equal((await call("DELETE", `/api/departments/${dep.json._id}`, { token: st })).status, 204); ok("staff deletes empty department");

  // slots + booking
  const d = new Date(); d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7) + 7); // a Monday, 1-2 weeks out
  const { localDate } = require("./lib");
  const date = localDate(d);
  const slots = (await call("GET", `/api/doctors/${doc._id}/slots?date=${date}`)).json;
  assert.deepEqual(slots, ["10:00", "10:15", "10:30", "10:45"]); ok("slots built from availability");
  const b1 = await call("POST", "/api/appointments", { token: pt, body: { doctor: doc._id, date, time: "10:00", reason: "checkup" } });
  assert.equal(b1.status, 201); assert.equal(b1.json.history.length, 1); ok("book slot, history has 1 line");
  assert.equal((await call("GET", `/api/doctors/${doc._id}/slots?date=${date}`)).json.includes("10:00"), false); ok("booked slot disappears");

  const pt2 = (await call("POST", "/api/auth/register", { body: { name: "Ravi", email: "ravi@test.dev", password: "password123" } })).json.token;
  assert.equal((await call("POST", "/api/appointments", { token: pt2, body: { doctor: doc._id, date, time: "10:00" } })).status, 409); ok("double booking 409");
  // the DB rule itself, bypassing the app check
  await assert.rejects(Appointment.create({ patient: b1.json.patient, doctor: doc._id, date, time: "10:00" }), (e) => e.code === 11000); ok("unique index rejects duplicate");

  assert.equal((await call("PATCH", `/api/appointments/${b1.json._id}/cancel`, { token: pt2 })).status, 404); ok("other patient cannot cancel");
  const cx = await call("PATCH", `/api/appointments/${b1.json._id}/cancel`, { token: pt });
  assert.equal(cx.json.status, "cancelled"); assert.equal(cx.json.history.length, 2); ok("cancel adds history");
  assert.equal((await call("POST", "/api/appointments", { token: pt2, body: { doctor: doc._id, date, time: "10:00" } })).status, 201); ok("cancelled slot can be rebooked");

  // past dates give no slots; rescheduling moves reminders; doctor with bookings can't be deleted
  assert.deepEqual((await call("GET", `/api/doctors/${doc._id}/slots?date=2020-01-06`)).json, []); ok("no past slots");
  const b2 = (await call("GET", "/api/appointments", { token: pt2 })).json[0];
  const { Notification: N } = require("./models");
  const before = await N.find({ ref: `appt:${b2._id}`, sent: false }).sort("sendAt");
  const rs = await call("PATCH", `/api/appointments/${b2._id}/reschedule`, { token: pt2, body: { date, time: "10:30" } });
  assert.equal(rs.status, 200);
  const after = await N.find({ ref: `appt:${b2._id}` });
  assert.ok(after.some((x) => /10:30/.test(x.message)) && !after.some((x) => !x.sent && /10:00/.test(x.message))); ok("reschedule replaces reminders");
  assert.equal((await call("DELETE", `/api/doctors/${doc._id}`, { token: st })).status, 409); ok("cannot delete doctor with bookings");

  // notifications from booking
  const notes = (await call("GET", "/api/notifications", { token: pt2 })).json;
  assert.ok(notes.some((x) => /confirmed/.test(x.message))); ok("booking confirmation in bell");

  // prescriptions
  const form = new FormData();
  form.append("image", new Blob([Buffer.from("89504e470d0a1a0a", "hex")], { type: "image/png" }), "rx.png");
  const up = await call("POST", "/api/prescriptions", { token: pt, form });
  assert.equal(up.status, 201); assert.equal(up.json.status, "uploaded"); ok("upload works without AI key (manual fallback)");
  const bad = new FormData(); bad.append("image", new Blob(["hi"], { type: "text/plain" }), "x.txt");
  assert.equal((await call("POST", "/api/prescriptions", { token: pt, form: bad })).status, 400); ok("non-image rejected");
  const rx = up.json._id;
  assert.equal((await call("PATCH", `/api/prescriptions/${rx}/send`, { token: pt, body: { medicines: [] } })).status, 400); ok("empty medicine list rejected");
  const sent = await call("PATCH", `/api/prescriptions/${rx}/send`, { token: pt, body: { medicines: [{ name: "Dolo 650", timesPerDay: 2, days: 5, quantity: 10 }] } });
  assert.equal(sent.json.status, "sent"); ok("patient sends request");
  assert.equal((await call("PATCH", `/api/prescriptions/${rx}/status`, { token: pt, body: { status: "approved" } })).status, 403); ok("patient cannot approve");
  assert.equal((await call("PATCH", `/api/prescriptions/${rx}/status`, { token: st, body: { status: "approved" } })).status, 409); ok("cannot skip the review step");
  await call("PATCH", `/api/prescriptions/${rx}/status`, { token: st, body: { status: "reviewing" } });
  assert.equal((await call("PATCH", `/api/prescriptions/${rx}/status`, { token: st, body: { status: "rejected" } })).status, 400); ok("reject needs a note");
  const appr = await call("PATCH", `/api/prescriptions/${rx}/status`, { token: st, body: { status: "approved", note: "ok" } });
  assert.equal(appr.json.status, "approved");
  const last = appr.json.history.at(-1); assert.equal(last.step, "approved"); assert.ok(last.by && last.at); ok("approve adds history line with step, time, staff");
  await call("PATCH", `/api/prescriptions/${rx}/status`, { token: st, body: { status: "ready" } });
  assert.ok((await call("GET", "/api/notifications", { token: pt })).json.some((x) => /ready for collection/.test(x.message))); ok("ready-for-collection alert");
  assert.equal((await call("GET", `/api/prescriptions/${rx}/image`, { token: pt2 })).status, 404); ok("other patient cannot see the photo");
  assert.equal((await call("GET", `/api/prescriptions/${rx}/image`, { token: st })).status, 200); ok("staff can see the photo");

  // concierge + unconfigured services
  const em = await call("POST", "/api/concierge", { token: pt, body: { messages: [{ role: "user", text: "I have chest pain" }] } });
  assert.equal(em.status, 200); assert.ok(em.json.emergency && /108/.test(em.json.reply)); ok("emergency answered without AI");
  assert.equal((await call("POST", "/api/concierge", { token: pt, body: { messages: [{ role: "user", text: "knee pain" }] } })).status, 503); ok("concierge 503 without key");

  // dummy payments: fee from the doctor, own active appointment only, pay once
  const b2a = (await call("GET", "/api/appointments", { token: pt2 })).json.find((x) => x.active);
  const pay = (t, b) => call("POST", "/api/payments/pay", { token: t, body: b });
  assert.equal((await pay(pt, { kind: "consultation", appointmentId: b2a._id })).status, 404); ok("cannot pay for another patient's appointment");
  assert.equal((await pay(pt, { kind: "consultation", appointmentId: b1.json._id })).status, 404); ok("cannot pay for a cancelled appointment");
  const p1 = await pay(pt2, { kind: "consultation", appointmentId: b2a._id, amount: 1 });
  assert.equal(p1.status, 201); assert.equal(p1.json.amount, 600); ok("payment uses doctor fee, ignores client amount");
  assert.equal((await pay(pt2, { kind: "consultation", appointmentId: b2a._id })).status, 409); ok("same appointment cannot be paid twice");
  assert.equal((await pay(pt, { kind: "pharmacy", prescriptionId: rx, amount: 228, simulate: "fail" })).status, 402); ok("failed payment recorded");
  assert.equal((await pay(pt, { kind: "pharmacy", prescriptionId: rx, amount: 228 })).status, 201); ok("pharmacy payment after ready");
  assert.equal((await pay(pt, { kind: "pharmacy", prescriptionId: rx, amount: 228 })).status, 409); ok("pharmacy request cannot be paid twice");
  assert.equal((await pay(pt2, { kind: "pharmacy", prescriptionId: rx, amount: 5 })).status, 409); ok("cannot pay for someone else's request");
  assert.equal((await call("GET", "/api/payments", { token: pt })).json.length, 2); ok("payment history");

  // reminders: a due unsent notification gets marked sent
  const { Notification } = require("./models");
  const n0 = await Notification.create({ user: b1.json.patient, message: "due", sendAt: new Date(Date.now() - 1000) });
  await require("./routes/notify").sendDue();
  assert.equal((await Notification.findById(n0.id)).sent, true); ok("cron job sends due reminders");

  // ---- security regressions ----
  const hd = await fetch(base + "/index.html");
  assert.equal(hd.headers.get("x-content-type-options"), "nosniff"); assert.ok(/default-src 'self'/.test(hd.headers.get("content-security-policy"))); ok("security headers set");
  const inj = await call("GET", "/api/doctors?department[$ne]=x"); assert.ok(inj.status === 400 || (inj.status === 200 && inj.json.length >= 6)); ok("query operator injection is not applied as a filter");
  assert.equal((await call("POST", "/api/doctors", { token: st, body: { name: "X", department: cardio._id, availability: [{ weekday: 9, start: "10:00", end: "11:00" }] } })).status, 400); ok("bad availability rejected");
  const ex = await call("POST", "/api/doctors", { token: st, body: { name: "Dr. Extra", department: cardio._id, _id: "000000000000000000000001", availability: [] } });
  assert.equal(ex.status, 201); assert.notEqual(ex.json._id, "000000000000000000000001"); ok("unknown fields (_id) ignored on create");
  const fake = new FormData(); fake.append("image", new Blob(["not an image"], { type: "image/png" }), "x.png");
  assert.equal((await call("POST", "/api/prescriptions", { token: pt, form: fake })).status, 400); ok("fake image (wrong magic bytes) rejected");
  assert.equal((await call("POST", "/api/auth/register", { body: { name: "L", email: "long@test.dev", password: "x".repeat(80) } })).status, 400); ok("over-long password rejected");
  assert.equal((await call("POST", "/api/auth/register", { body: { name: "L", email: "not-an-email", password: "password123" } })).status, 400); ok("bad email rejected");
  await call("PATCH", `/api/appointments/${b2a._id}/status`, { token: st, body: { status: "confirmed" } });
  await call("PATCH", `/api/appointments/${b2a._id}/status`, { token: st, body: { status: "completed" } });
  assert.equal((await call("PATCH", `/api/appointments/${b2a._id}/cancel`, { token: pt2 })).status, 400); ok("completed appointment cannot be cancelled");
  assert.equal((await call("PATCH", `/api/appointments/${b2a._id}/reschedule`, { token: pt2, body: { date, time: "10:45" } })).status, 400); ok("completed appointment cannot be rescheduled");
  const gone = (await call("POST", "/api/auth/register", { body: { name: "Gone", email: "gone@test.dev", password: "password123" } })).json;
  await User.deleteOne({ _id: gone.user.id });
  assert.equal((await call("GET", "/api/appointments", { token: gone.token })).status, 401); ok("token of a deleted user stops working");
  await User.updateOne({ email: "staff@test.dev" }, { role: "patient" });
  assert.equal((await call("POST", "/api/doctors", { token: st, body: { name: "Y", department: cardio._id } })).status, 403); ok("demoted staff loses access immediately");
  await User.updateOne({ email: "staff@test.dev" }, { role: "staff" });
  let limited = 0;
  for (let i = 0; i < 25; i++) if ((await call("POST", "/api/auth/login", { body: { email: "asha@test.dev", password: "bad" + i } })).status === 429) limited++;
  assert.ok(limited > 0); ok("login brute force gets 429");

  // static safety
  assert.equal((await call("GET", "/.env")).status, 404);
  assert.equal((await call("GET", "/server/.env")).status, 404);
  assert.equal((await call("GET", "/image2.png")).status, 404);
  assert.equal((await call("GET", "/index.html")).status, 200); ok("static serves public/ only");

  console.log(`\nALL ${n} CHECKS PASSED`);
  server.close(); await mongoose.disconnect(); await mongod.stop(); process.exit(0);
})().catch((e) => { console.error("\nFAILED:", e); process.exit(1); });
