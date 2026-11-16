// node cleanup-test-data.js         -> preview only (counts, deletes nothing)
// node cleanup-test-data.js --yes   -> deletes
// Scope: patient users whose email ends in @test.dev (made by the test scripts), plus ONLY their
// appointments, prescription requests (and photo files), notifications and payments,
// plus upload files that no remaining request uses.
// Never touches staff, doctors, departments, or any other user.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { User, Appointment, PrescriptionRequest, Notification, Payment } = require("./models");

const DELETE = process.argv.includes("--yes");

(async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI missing in .env");
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find({ email: /@test\.dev$/i, role: "patient" }).select("_id email");
  const ids = users.map((u) => u._id);
  const rx = await PrescriptionRequest.find({ patient: { $in: ids } }).select("imagePath");
  const counts = {
    users: users.length,
    appointments: await Appointment.countDocuments({ patient: { $in: ids } }),
    prescriptions: rx.length,
    notifications: await Notification.countDocuments({ user: { $in: ids } }),
    payments: await Payment.countDocuments({ user: { $in: ids } }),
  };
  const dir = path.join(__dirname, "uploads");
  // after the test users' requests are gone, any file no remaining request points at is an orphan
  const keep = new Set((await PrescriptionRequest.find({ patient: { $nin: ids } }).select("imagePath")).map((p) => path.basename(p.imagePath || "")));
  const orphans = fs.readdirSync(dir).filter((f) => f !== ".gitkeep" && !keep.has(f));
  counts.uploadFiles = orphans.length;
  console.log(DELETE ? "Deleting:" : "Preview (nothing deleted). Would delete:", counts);
  console.log("Total users in DB:", await User.countDocuments(), "| staff kept:", await User.countDocuments({ role: "staff" }));

  if (DELETE) {
    let files = 0;
    for (const f of orphans) { try { fs.unlinkSync(path.join(dir, f)); files++; } catch {} }
    await Appointment.deleteMany({ patient: { $in: ids } });
    await PrescriptionRequest.deleteMany({ patient: { $in: ids } });
    await Notification.deleteMany({ user: { $in: ids } });
    await Payment.deleteMany({ user: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    console.log(`Done. Photo files removed: ${files}`);
  } else console.log("Run again with --yes to delete.");
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
