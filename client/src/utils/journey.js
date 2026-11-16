// Turns a request's status + history into the steps the tracker draws.
import { fmtTime } from "./helpers.js";

const at = (history, step) => {
  const h = history.find((x) => x.step === step);
  return h ? fmtTime(h.at) : "";
};

export function rxSteps(p) {
  const st = p.status;
  const rank = { uploaded: 1, ai_read: 2, sent: 3, reviewing: 3, approved: 3, rejected: 3, ready: 4, collected: 5 }[st];
  const review = { sent: "Waiting for staff", reviewing: "In progress", approved: "Approved", rejected: "Rejected" }[st] || at(p.history, "reviewing");
  const labels = [
    ["Uploaded", at(p.history, "uploaded")],
    ["AI read", p.medicines.length ? p.medicines.length + " medicines" : "Enter manually"],
    ["Staff reviewing", review],
    ["Ready for pickup", at(p.history, "ready")],
    ["Collected", at(p.history, "collected")],
  ];
  return labels.map(([label, detail], i) => ({
    label, detail,
    state: st === "collected" || i + 1 < rank ? "done" : i + 1 === rank ? (st === "rejected" ? "bad" : "now") : "todo",
  }));
}

export function aptSteps(a) {
  if (a.status === "cancelled")
    return [{ label: "Booked", detail: at(a.history, "booked"), state: "done" }, { label: "Cancelled", detail: at(a.history, "cancelled"), state: "bad" }];
  const rank = { booked: 1, confirmed: 2, completed: 3 }[a.status];
  return [["Booked", "booked"], ["Confirmed", "confirmed"], ["Consultation done", "completed"]].map(([label, s], i) => ({
    label, detail: at(a.history, s),
    state: a.status === "completed" || i + 1 < rank ? "done" : i + 1 === rank ? "now" : "todo",
  }));
}
