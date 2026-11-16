// module 5: AI Hospital Concierge with function calling
const r = require("express").Router();
const { Department, Doctor, Appointment, PrescriptionRequest } = require("../models");
const { auth, wrap, freeSlots, bookSlot, localDate, withRetry, rateLimit } = require("../lib");

// deterministic check runs BEFORE any AI call
const EMERGENCY = /chest pain|heart attack|can'?t breathe|cannot breathe|difficulty breathing|unconscious|severe bleeding|stroke|seizure|suicid|overdose|poison/i;
const EMERGENCY_REPLY = "This may be an emergency. Go to the hospital Emergency ward now or call 108. Please do not wait for an appointment.";

const SYSTEM = `You are the MediAssist Hospital Concierge for an Indian hospital.
- Suggest a department and doctor for the symptoms described. NEVER diagnose and NEVER suggest or name medicines or doses.
- Use tools to look up doctors, check free slots, book appointments and check request status. Never invent doctors, times or statuses.
- Before booking, confirm doctor, date and time with the patient. Book only after they agree.
- If the patient describes an emergency, tell them to go to Emergency or call 108.
- Keep replies short and plain. Today is {TODAY}.`;

const tools = (Type) => [{ functionDeclarations: [
  { name: "searchDoctors", description: "Find doctors, optionally by department name",
    parameters: { type: Type.OBJECT, properties: { department: { type: Type.STRING, description: "e.g. Orthopaedics" } } } },
  { name: "checkSlots", description: "Free 15-minute slots for a doctor on a date",
    parameters: { type: Type.OBJECT, properties: { doctorId: { type: Type.STRING }, date: { type: Type.STRING, description: "YYYY-MM-DD" } }, required: ["doctorId", "date"] } },
  { name: "bookAppointment", description: "Book a slot for the logged-in patient",
    parameters: { type: Type.OBJECT, properties: { doctorId: { type: Type.STRING }, date: { type: Type.STRING }, time: { type: Type.STRING, description: "HH:MM 24h" }, reason: { type: Type.STRING } }, required: ["doctorId", "date", "time"] } },
  { name: "getRequestStatus", description: "Status of the patient's latest prescription request and next appointment",
    parameters: { type: Type.OBJECT, properties: {} } },
] }];

// the patient id always comes from the JWT, never from model arguments
const handlers = {
  async searchDoctors({ department }) {
    let q = {};
    if (department) {
      const d = await Department.findOne({ name: new RegExp(String(department).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") });
      if (!d) return { doctors: [], note: "No such department", departments: (await Department.find()).map((x) => x.name) };
      q = { department: d._id };
    }
    const docs = await Doctor.find(q).populate("department", "name").limit(10);
    return { doctors: docs.map((d) => ({ id: d.id, name: d.name, department: d.department.name, qualification: d.qualification, fee: d.fee })) };
  },
  async checkSlots({ doctorId, date }) {
    const s = await freeSlots(doctorId, date).catch(() => null);
    return s ? { freeSlots: s } : { error: "Doctor not found" };
  },
  async bookAppointment({ doctorId, date, time, reason }, user) {
    try {
      const a = await bookSlot({ patientId: user.id, doctorId, date, time, reason });
      return { booked: true, appointmentId: a.id, date, time };
    } catch (e) { return { booked: false, error: e.message }; }
  },
  async getRequestStatus(_a, user) {
    const rx = await PrescriptionRequest.findOne({ patient: user.id }).sort("-createdAt");
    const ap = await Appointment.findOne({ patient: user.id, active: true }).sort("-createdAt").populate("doctor", "name");
    return {
      prescription: rx ? { status: rx.status, note: rx.staffNote } : null,
      appointment: ap ? { doctor: ap.doctor ? ap.doctor.name : "(doctor removed)", date: ap.date, time: ap.time, status: ap.status } : null,
    };
  },
};

// body: { messages: [{role: "user"|"model", text}] }  (client keeps the chat history)
r.post("/concierge", auth, rateLimit(40, 60 * 60 * 1000), wrap(async (req, res) => {
  const msgs = (req.body.messages || []).slice(-20).filter((m) => m && typeof m.text === "string");
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== "user") return res.status(400).json({ error: "messages must end with a user message" });
  if (EMERGENCY.test(last.text)) return res.json({ reply: EMERGENCY_REPLY, emergency: true });

  if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL)
    return res.status(503).json({ error: "Concierge is not configured (set GEMINI_API_KEY and GEMINI_MODEL)" });
  const { GoogleGenAI, Type } = require("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const contents = msgs.map((m) => ({ role: m.role === "model" ? "model" : "user", parts: [{ text: m.text.slice(0, 1000) }] }));
  const config = { systemInstruction: SYSTEM.replace("{TODAY}", localDate()), tools: tools(Type) };

  for (let i = 0; i < 5; i++) { // cap tool-call rounds
    const out = await withRetry(() => ai.models.generateContent({ model: process.env.GEMINI_MODEL, contents, config }))
      .catch((e) => { // never pass raw provider errors to the browser
        if (e.status === 503 && /busy/.test(e.message)) throw e;
        console.error("Gemini error:", e.status, String(e.message).slice(0, 200));
        throw Object.assign(new Error("The assistant had a problem. Please try again."), { status: 502 });
      });
    const calls = out.functionCalls;
    if (!calls || !calls.length) return res.json({ reply: out.text });
    contents.push(out.candidates[0].content);
    const parts = [];
    for (const c of calls) {
      const fn = handlers[c.name];
      const result = fn ? await fn(c.args || {}, req.user).catch((e) => ({ error: e.message })) : { error: "Unknown tool" };
      parts.push({ functionResponse: { name: c.name, response: result } });
    }
    contents.push({ role: "user", parts });
  }
  res.json({ reply: "Sorry, I could not finish that. Please try again." });
}));

module.exports = r;
