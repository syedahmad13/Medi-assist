// module 7: notifications, reminders (cron), dummy payments
const r = require("express").Router();
const crypto = require("crypto");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const { Notification, Payment, User, Appointment, PrescriptionRequest } = require("../models");
const { auth, wrap, rateLimit } = require("../lib");

/* ---- bell icon ---- */
r.get("/notifications", auth, wrap(async (req, res) => {
  // only show ones already due
  res.json(await Notification.find({ user: req.user.id, sendAt: { $lte: new Date() } }).sort("-sendAt").limit(50));
}));
r.patch("/notifications/:id/read", auth, wrap(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user.id }, { read: true });
  res.status(204).end();
}));

/* ---- email + reminder timer ---- */
// no SMTP_URL -> jsonTransport just logs the email to the console
const mailer = nodemailer.createTransport(process.env.SMTP_URL || { jsonTransport: true });

async function sendDue() {
  const due = await Notification.find({ sent: false, sendAt: { $lte: new Date() } }).limit(100);
  for (const n of due) {
    const u = await User.findById(n.user);
    if (!u) { n.sent = true; await n.save(); continue; } // user deleted: nothing to send, don't retry forever
    try {
      const info = await mailer.sendMail({ from: process.env.MAIL_FROM || "MediAssist <no-reply@mediassist.local>", to: u && u.email, subject: "MediAssist", text: n.message });
      if (!process.env.SMTP_URL) console.log("[email]", info.message);
      n.sent = true;
      await n.save();
    } catch (e) { console.error("email failed:", e.message); } // stays unsent, retried next tick
  }
}
const startReminders = () => cron.schedule("*/5 * * * *", () => sendDue().catch(console.error));

/* ---- payments: DUMMY. No gateway, no real money. Outcome is chosen by the caller to demo success/failure. ---- */
// consultation: pay the doctor's fee for your own active appointment (amount comes from the server).
// pharmacy: pay for your own request once it is "ready" (demo bill amount from the body, no prices are stored yet).
// Each appointment / request can only be paid once.
r.post("/payments/pay", auth, rateLimit(30, 60 * 60 * 1000), wrap(async (req, res) => {
  const { kind, simulate } = req.body;
  let rupees, link;
  if (kind === "consultation") {
    const a = await Appointment.findOne({ _id: String(req.body.appointmentId), patient: req.user.id, active: true }).populate("doctor");
    if (!a || !a.doctor) return res.status(404).json({ error: "Appointment not found" });
    rupees = a.doctor.fee; link = { appointment: a._id };
  } else if (kind === "pharmacy") {
    const p = await PrescriptionRequest.findOne({ _id: String(req.body.prescriptionId), patient: req.user.id });
    if (!p || p.status !== "ready") return res.status(409).json({ error: "Pay after the pharmacy marks your medicines ready" });
    rupees = Number(req.body.amount);
    if (!(rupees > 0 && rupees <= 100000)) return res.status(400).json({ error: "amount must be between 1 and 100000" });
    link = { prescription: p._id };
  } else return res.status(400).json({ error: "kind must be consultation or pharmacy" });

  if (await Payment.exists({ ...link, status: "success" })) return res.status(409).json({ error: "Already paid" });
  const ok = simulate !== "fail";
  const p = await Payment.create({
    user: req.user.id, kind, amount: rupees, status: ok ? "success" : "failed", ...link,
    orderId: "dummy_" + crypto.randomBytes(6).toString("hex"),
  });
  await Notification.create({ user: req.user.id, message: ok ? `Payment of ₹${rupees} succeeded.` : `Payment of ₹${rupees} failed.` });
  res.status(ok ? 201 : 402).json(p);
}));

r.get("/payments", auth, wrap(async (req, res) => res.json(await Payment.find({ user: req.user.id }).sort("-createdAt"))));

module.exports = r;
module.exports.startReminders = startReminders;
module.exports.sendDue = sendDue;
