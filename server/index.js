require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    // scripts only from this site (no inline scripts); inline styles are still allowed; fonts from Google
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "100kb" }));
app.get("/api", (_q, res) => res.json({ ok: true, name: "MediAssist API running" }));
for (const f of ["core", "pharmacy", "concierge", "notify"]) app.use("/api", require(`./routes/${f}`));
app.use("/api", (_q, res) => res.status(404).json({ error: "No such route" }));

// The React app is built into client/dist (run `npm run build`). Its build also copies public/
// (style.css, logo.svg, hospital.html, doctors.xml). Only these two folders are served: never the project
// root, which would expose server/.env.
const DIST = path.join(__dirname, "..", "client", "dist");
const hasDist = fs.existsSync(path.join(DIST, "index.html"));
app.use(express.static(DIST));
app.use(express.static(path.join(__dirname, "..", "public")));

// React Router pages (/doctors, /dashboard ...) all return index.html. Plain middleware because Express 5
// rejects "*" routes. Skips /api and anything with a file extension, so a missing .js or .png still 404s.
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api") || path.extname(req.path) || /(^|\/)\./.test(req.path)) return next(); // files and dotfiles are never "pages"
  if (!hasDist) return res.status(503).type("text").send("The website is not built yet. Run: npm run build (in the server folder), then restart.");
  res.sendFile(path.join(DIST, "index.html"));
});

app.use((err, _q, res, _n) => {
  if (err.name === "CastError") return res.status(400).json({ error: "Invalid input" });
  if (err.code === 11000) return res.status(409).json({ error: "That name already exists" });
  if (err.name === "ValidationError" || err.code === "LIMIT_FILE_SIZE" || /Only JPG/.test(err.message))
    return res.status(400).json({ error: err.message });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16 || /^change-me/.test(process.env.JWT_SECRET))
    throw new Error("JWT_SECRET missing or too weak: set a long random value in .env");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI missing: copy .env.example to .env");
  if (mongoose.connection.readyState !== 1) await mongoose.connect(process.env.MONGO_URI);
  await require("./models").Appointment.init(); // make sure the unique index exists
  require("./routes/notify").startReminders();
  const port = process.env.PORT || 3000;
  // localhost only by default, so other devices on the Wi-Fi cannot reach it; set HOST=0.0.0.0 to expose deliberately
  app.listen(port, process.env.HOST || "127.0.0.1", () => console.log(`MediAssist on http://localhost:${port}`));
}

module.exports = app;
module.exports.start = start;
if (require.main === module) start().catch((e) => { console.error(e.message); process.exit(1); });
