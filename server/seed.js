// node seed.js  -> creates the staff user, departments and sample doctors (safe to re-run)
require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { User, Department, Doctor } = require("./models");

async function seed() {
  const email = process.env.SEED_STAFF_EMAIL, pw = process.env.SEED_STAFF_PASSWORD;
  if (!email || !pw) throw new Error("Set SEED_STAFF_EMAIL and SEED_STAFF_PASSWORD in .env");
  if (pw === "change-me-too" || pw.length < 8) throw new Error("SEED_STAFF_PASSWORD is a placeholder or under 8 characters. Set a real one in .env, then run seed again.");
  // .env is the source of truth for the staff login: re-running seed resets this password
  await User.updateOne({ email }, { $set: { password: await bcrypt.hash(pw, 10), role: "staff" }, $setOnInsert: { name: "Hospital Staff", email } }, { upsert: true });

  const mon_fri = (start, end) => [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start, end }));
  const plan = {
    Cardiology: [["Dr. Arvind Mehta", "MBBS, MD", 22, 1200, "10:00", "13:00"]],
    Orthopaedics: [["Dr. Rohan Mehta", "MBBS, MS Ortho", 14, 1000, "10:00", "13:00"]],
    Pediatrics: [["Dr. Sunita Rao", "MBBS, DCH", 16, 800, "11:00", "17:00"]],
    ENT: [["Dr. Kiran Shah", "MBBS, MS ENT", 10, 700, "09:30", "16:00"]],
    Dermatology: [["Dr. Neha Iyer", "MBBS, MD Derm", 9, 800, "10:00", "14:00"]],
    "General Medicine": [["Dr. Imran Qureshi", "MBBS, MD", 12, 500, "09:00", "17:00"]],
  };
  for (const [dep, docs] of Object.entries(plan)) {
    const d = await Department.findOneAndUpdate({ name: dep }, { name: dep }, { upsert: true, returnDocument: "after" });
    for (const [name, qualification, experienceYears, fee, s, e] of docs)
      await Doctor.updateOne({ name }, { $setOnInsert: { name, department: d._id, qualification, experienceYears, fee, availability: mon_fri(s, e) } }, { upsert: true });
  }
}
module.exports = seed;
if (require.main === module)
  mongoose.connect(process.env.MONGO_URI).then(seed).then(() => { console.log("Seeded"); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(1); });
