// some ISP/router DNS refuses the SRV lookup Atlas needs; DNS_SERVERS=8.8.8.8,1.1.1.1 in .env works around it
if (process.env.DNS_SERVERS) require("dns").setServers(process.env.DNS_SERVERS.split(","));

const { Schema, model } = require("mongoose");

const history = [{ step: String, at: { type: Date, default: Date.now }, by: { type: Schema.Types.ObjectId, ref: "User" }, note: String, _id: false }];

const User = model("User", new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: String,
  password: { type: String, required: true },
  role: { type: String, enum: ["patient", "staff"], default: "patient" },
}, { timestamps: true }));

const Department = model("Department", new Schema({
  name: { type: String, required: true, unique: true },
  description: String,
}));

const Doctor = model("Doctor", new Schema({
  name: { type: String, required: true },
  department: { type: Schema.Types.ObjectId, ref: "Department", required: true },
  qualification: String,
  experienceYears: Number,
  fee: { type: Number, default: 500 },
  // weekday 0=Sun..6=Sat, times "HH:MM" 24h
  availability: [{ weekday: { type: Number, min: 0, max: 6 }, start: String, end: String, _id: false }],
}));

const apptSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: "User", required: true },
  doctor: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  time: { type: String, required: true }, // HH:MM
  reason: String,
  status: { type: String, enum: ["booked", "confirmed", "completed", "cancelled"], default: "booked" },
  active: { type: Boolean, default: true },
  history,
}, { timestamps: true });
// one live booking per doctor/date/time; cancelled ones (active:false) free the slot
apptSchema.index({ doctor: 1, date: 1, time: 1 }, { unique: true, partialFilterExpression: { active: true } });
const Appointment = model("Appointment", apptSchema);

const PrescriptionRequest = model("PrescriptionRequest", new Schema({
  patient: { type: Schema.Types.ObjectId, ref: "User", required: true },
  imagePath: String,
  medicines: [{ name: String, dosage: String, timesPerDay: Number, days: Number, quantity: Number, _id: false }],
  status: { type: String, enum: ["uploaded", "ai_read", "sent", "reviewing", "approved", "rejected", "ready", "collected"], default: "uploaded" },
  staffNote: String,
  history,
}, { timestamps: true }));

const Notification = model("Notification", new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  message: String,
  read: { type: Boolean, default: false },
  sendAt: { type: Date, default: Date.now },
  sent: { type: Boolean, default: false },
  ref: String, // e.g. "appt:<id>" so cancel can drop pending reminders
}, { timestamps: true }));

const Payment = model("Payment", new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  kind: { type: String, enum: ["consultation", "pharmacy"] },
  amount: Number, // rupees
  status: { type: String, enum: ["success", "failed"], required: true },
  appointment: { type: Schema.Types.ObjectId, ref: "Appointment" },
  prescription: { type: Schema.Types.ObjectId, ref: "PrescriptionRequest" },
  orderId: String, // fake receipt id
}, { timestamps: true }));

module.exports = { User, Department, Doctor, Appointment, PrescriptionRequest, Notification, Payment };
