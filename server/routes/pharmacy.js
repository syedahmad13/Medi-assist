// module 4 (prescriptions) + module 6 (journey is the `history` on each request)
const r = require("express").Router();
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { PrescriptionRequest, Notification } = require("../models");
const { auth, requireRole, setStatus, wrap, withRetry, rateLimit } = require("../lib");

const DIR = path.join(__dirname, "..", "uploads"); // outside public/, served only via the auth'd route below
fs.mkdirSync(DIR, { recursive: true });
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const upload = multer({
  storage: multer.diskStorage({
    destination: DIR,
    filename: (_q, f, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${EXT[f.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_q, f, cb) => cb(EXT[f.mimetype] ? null : new Error("Only JPG, PNG or WebP images"), !!EXT[f.mimetype]),
});

// the mimetype comes from the client, so also check the file's real first bytes
function isRealImage(file) {
  const b = Buffer.alloc(12);
  const fd = fs.openSync(file.path, "r");
  try { fs.readSync(fd, b, 0, 12, 0); } finally { fs.closeSync(fd); }
  if (file.mimetype === "image/png") return b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (file.mimetype === "image/jpeg") return b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  return b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP"; // webp
}

// medicine lists come from the AI or the browser: cap size, coerce types, drop junk
const numOrNull = (v) => (v === "" || v == null || !(Number(v) >= 0) ? null : Math.min(Number(v), 1000));
const cleanMeds = (list) => (Array.isArray(list) ? list : []).slice(0, 30)
  .map((m) => m && ({ name: String(m.name ?? "").trim().slice(0, 100), dosage: m.dosage == null ? null : String(m.dosage).slice(0, 100),
    timesPerDay: numOrNull(m.timesPerDay), days: numOrNull(m.days), quantity: numOrNull(m.quantity) }))
  .filter((m) => m && m.name);

const gemini = () => {
  if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL) return null;
  const { GoogleGenAI } = require("@google/genai");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

const PROMPT = `Read this handwritten or printed Indian prescription. List every medicine.
Short forms: 1-0-1 = morning and night (2/day), 1-1-1 and TDS = 3/day, OD and 1-0-0 = once a day, BD = twice a day, SOS = only when needed (timesPerDay 0).
Return only what is written. If a field is unreadable use null. Do not guess medicines.`;

async function readWithAI(file) {
  const ai = gemini();
  if (!ai) throw Object.assign(new Error("AI reading is not configured (set GEMINI_API_KEY and GEMINI_MODEL)"), { status: 503 });
  const { Type } = require("@google/genai");
  const res = await withRetry(() => ai.models.generateContent({
    model: process.env.GEMINI_MODEL,
    contents: [{ role: "user", parts: [
      { inlineData: { mimeType: file.mimetype, data: fs.readFileSync(file.path).toString("base64") } },
      { text: PROMPT },
    ] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.OBJECT, properties: {
          name: { type: Type.STRING }, dosage: { type: Type.STRING, nullable: true },
          timesPerDay: { type: Type.INTEGER, nullable: true }, days: { type: Type.INTEGER, nullable: true },
        }, required: ["name"] },
      },
    },
  }));
  return cleanMeds(JSON.parse(res.text).map((m) => ({ ...m, quantity: m.timesPerDay && m.days ? m.timesPerDay * m.days : null })));
}

// patient uploads photo -> AI reads it -> status "ai_read"
r.post("/prescriptions", auth, rateLimit(20, 60 * 60 * 1000), upload.single("image"), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "image file required" });
  if (!isRealImage(req.file)) { fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: "That file is not a valid image" }); }
  const p = new PrescriptionRequest({ patient: req.user.id, imagePath: req.file.filename });
  setStatus(p, "uploaded", req.user.id);
  try {
    p.medicines = await readWithAI(req.file);
    setStatus(p, "ai_read", null, "AI read the prescription");
  } catch (e) {
    if (e.status !== 503) console.error("AI read failed:", e.message);
    p.staffNote = e.status === 503 ? "AI not configured, enter medicines manually" : "AI could not read the image, enter medicines manually";
  }
  await p.save();
  res.status(201).json(p);
}));

const visible = (req, p) => p && (req.user.role === "staff" || String(p.patient) === req.user.id);

r.get("/prescriptions", auth, wrap(async (req, res) => {
  const q = req.user.role === "staff" ? (req.query.status ? { status: String(req.query.status) } : {}) : { patient: req.user.id };
  res.json(await PrescriptionRequest.find(q).populate("patient", "name").sort("-createdAt"));
}));

r.get("/prescriptions/:id", auth, wrap(async (req, res) => {
  const p = await PrescriptionRequest.findById(req.params.id).populate("patient", "name");
  visible(req, p) ? res.json(p) : res.status(404).json({ error: "Not found" });
}));

// authenticated image download (staff compare photo to AI list)
r.get("/prescriptions/:id/image", auth, wrap(async (req, res) => {
  const p = await PrescriptionRequest.findById(req.params.id);
  if (!visible(req, p) || !p.imagePath) return res.status(404).json({ error: "Not found" });
  res.sendFile(path.join(DIR, path.basename(p.imagePath)));
}));

// patient checks/fixes the list and sends the medicine request
r.patch("/prescriptions/:id/send", auth, wrap(async (req, res) => {
  const p = await PrescriptionRequest.findById(req.params.id);
  if (!p || String(p.patient) !== req.user.id) return res.status(404).json({ error: "Not found" });
  if (!["uploaded", "ai_read"].includes(p.status)) return res.status(409).json({ error: "Already sent" });
  if (Array.isArray(req.body.medicines)) p.medicines = cleanMeds(req.body.medicines);
  if (!p.medicines.length) return res.status(400).json({ error: "Add at least one medicine" });
  setStatus(p, "sent", req.user.id);
  await p.save();
  res.json(p);
}));

// staff: start review, fix list, approve / reject with note, mark ready / collected
const NEXT = { sent: ["reviewing"], reviewing: ["approved", "rejected"], approved: ["ready"], ready: ["collected"] };
const MSG = {
  approved: "Your prescription request was approved.",
  rejected: "Your prescription request was rejected.",
  ready: "Your medicines are ready for collection at the hospital pharmacy.",
};
r.patch("/prescriptions/:id/status", requireRole("staff"), wrap(async (req, res) => {
  const p = await PrescriptionRequest.findById(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  const { status, note, medicines } = req.body;
  if (!(NEXT[p.status] || []).includes(status))
    return res.status(409).json({ error: `Cannot go from ${p.status} to ${status}` });
  if (Array.isArray(medicines)) p.medicines = cleanMeds(medicines);
  const cleanNote = String(note ?? "").trim().slice(0, 500);
  if (status === "rejected" && !cleanNote) return res.status(400).json({ error: "A note is required when rejecting" });
  if (cleanNote) p.staffNote = cleanNote;
  setStatus(p, status, req.user.id, cleanNote || undefined);
  await p.save();
  // sent:false so the 5-minute timer also emails it
  if (MSG[status]) await Notification.create({ user: p.patient, message: MSG[status] + (cleanNote ? ` Note: ${cleanNote}` : ""), ref: `rx:${p.id}` });
  res.json(p);
}));

module.exports = r;
