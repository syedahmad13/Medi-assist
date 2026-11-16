import { useCallback, useEffect, useState } from "react";
import JourneyTracker from "../../components/JourneyTracker.jsx";
import MedicineRows, { newRow, rowsToMedicines } from "../../components/MedicineRows.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { api, fetchImageUrl } from "../../services/api.js";
import { fmtTime } from "../../utils/helpers.js";
import { rxSteps } from "../../utils/journey.js";

const NEXT = {
  sent: [["reviewing", "Start review"]],
  reviewing: [["approved", "Approve"], ["rejected", "Reject"]],
  approved: [["ready", "Mark ready for pickup"]],
  ready: [["collected", "Mark collected"]],
};
const FILTERS = ["sent", "reviewing", "approved", "rejected", "ready", "collected", "uploaded", "ai_read"];

export default function RxReview() {
  const toast = useToast();
  const [filter, setFilter] = useState("");
  const [list, setList] = useState(null);
  const [selId, setSelId] = useState(null);

  const load = useCallback(() => api("/prescriptions" + (filter ? "?status=" + filter : "")).then(setList).catch((e) => toast(e.message, true)), [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const selected = list && list.find((p) => p._id === selId);

  return (
    <div className="two">
      <div>
        <label htmlFor="flt">Show</label>
        <select id="flt" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option>
          {FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {list && list.length === 0 && <p className="empty">No requests.</p>}
        {list && list.map((p) => (
          <div key={p._id} className={"listrow" + (p._id === selId ? " on" : "")} onClick={() => setSelId(p._id)}>
            <b className="j" style={{ color: "var(--ink)" }}>#{p._id.slice(-6).toUpperCase()}</b> {p.patient ? p.patient.name : ""} <span className="stat">{p.status}</span>
            <br /><small style={{ color: "var(--mute)" }}>{fmtTime(p.createdAt)}</small>
          </div>
        ))}
      </div>
      <div className="card" id="rxd">
        {selected
          ? <Review key={selected._id + selected.status} p={selected} onUpdated={() => { setFilter(""); load(); }} />
          : <p className="empty">Select a request.</p>}
      </div>
    </div>
  );
}

function Review({ p, onUpdated }) {
  const toast = useToast();
  const reviewing = p.status === "reviewing";
  const [rows, setRows] = useState(() => p.medicines.map(newRow));
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    let url = null, ignore = false;
    fetchImageUrl(`/prescriptions/${p._id}/image`).then((u) => { if (ignore) u && URL.revokeObjectURL(u); else { url = u; setPhoto(u); } }).catch(() => {});
    return () => { ignore = true; if (url) URL.revokeObjectURL(url); };
  }, [p._id]);

  const go = async (status) => {
    const body = { status, note: note.trim() || undefined };
    if (reviewing) body.medicines = rowsToMedicines(rows); // staff may have fixed the AI's mistakes
    try { await api(`/prescriptions/${p._id}/status`, { method: "PATCH", body }); toast("Updated"); onUpdated(); }
    catch (e) { toast(e.message, true); }
  };

  return (
    <>
      <h3 style={{ fontSize: 18 }}>Request #{p._id.slice(-6).toUpperCase()} · {p.patient ? p.patient.name : ""}</h3>
      <div style={{ margin: "16px 0" }}><JourneyTracker steps={rxSteps(p)} /></div>
      <img id="ph" alt="Prescription photo" src={photo || undefined}
        style={{ maxWidth: "100%", maxHeight: 300, border: "1px solid var(--line)", borderRadius: 10, marginBottom: 14, display: photo ? "block" : "none" }} />
      <h4 className="j" style={{ marginBottom: 8 }}>AI list {reviewing ? "(fix any mistake)" : ""}</h4>
      {reviewing ? (
        <>
          <MedicineRows rows={rows} setRows={setRows} />
          <button className="btn sm" id="addm" type="button" onClick={() => setRows((r) => [...r, newRow()])}>Add row</button>
        </>
      ) : p.medicines.map((m, i) => (
        <div className="med" key={i}>
          <div><b>{m.name}</b><small>{m.dosage || ""} · {m.timesPerDay ?? "?"}/day · {m.days ?? "?"} days</small></div>
          <span>{m.quantity ?? "?"} qty</span>
        </div>
      ))}
      {NEXT[p.status] && (
        <>
          <label htmlFor="note" style={{ display: "block", marginTop: 16 }}>Note to patient {reviewing ? "(required for reject)" : "(optional)"}</label>
          <textarea id="note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {NEXT[p.status].map(([s, label]) => <button key={s} className={"btn " + (s === "rejected" ? "d" : "p")} data-s={s} onClick={() => go(s)}>{label}</button>)}
          </div>
        </>
      )}
      <h4 className="j" style={{ margin: "20px 0 8px" }}>History</h4>
      {p.history.map((h, i) => <div key={i} style={{ fontSize: 13, padding: "4px 0" }}>{h.step} · {fmtTime(h.at)}{h.note ? " · " + h.note : ""}</div>)}
    </>
  );
}
