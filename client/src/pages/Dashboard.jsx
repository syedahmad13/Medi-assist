import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import JourneyTracker from "../components/JourneyTracker.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { api } from "../services/api.js";
import { fmtTime, localDate } from "../utils/helpers.js";
import { aptSteps, rxSteps } from "../utils/journey.js";

const linkStyle = { color: "var(--p)", fontWeight: 600 };
const h2 = { fontSize: 20, margin: "32px 0 12px" };

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null); // { appts, rxs, pays }
  const [resched, setResched] = useState(null); // appointment being rescheduled

  const load = useCallback(async () => {
    const [appts, rxs, pays] = await Promise.all([api("/appointments"), api("/prescriptions"), api("/payments")]);
    setData({ appts, rxs, pays });
  }, []);

  useEffect(() => { load().catch((e) => toast(e.message, true)); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  // run an action, then refresh the lists
  const run = async (fn) => { try { await fn(); await load(); } catch (e) { toast(e.message, true); } };

  const cancel = (a) => confirm("Cancel this appointment?") && run(async () => { await api(`/appointments/${a._id}/cancel`, { method: "PATCH" }); toast("Appointment cancelled"); });
  const pay = (a, fail) => run(async () => {
    try {
      await api("/payments/pay", { method: "POST", body: { kind: "consultation", appointmentId: a._id, simulate: fail ? "fail" : "success" } });
      toast("Payment successful (demo)");
    } catch (err) { if (err.status === 402) toast("Payment failed (demo)", true); else throw err; }
  });

  return (
    <main className="w pg">
      <h1 id="hi">Hello, {user.name.split(" ")[0]}</h1>
      <p>Your appointments, prescription requests and payments in one place.</p>

      <h2 style={h2}>Appointments</h2>
      <div id="appts">
        {!data && <p className="empty">Loading…</p>}
        {data && data.appts.length === 0 && <p className="empty">No appointments yet. <Link to="/doctors" style={linkStyle}>Book one</Link></p>}
        {data && data.appts.map((a) => (
          <div className="card" key={a._id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <b className="j" style={{ color: "var(--ink)", fontSize: 17 }}>{a.doctor ? a.doctor.name : "Doctor removed"}</b><br />
                {a.date} at {a.time}{a.reason ? " · " + a.reason : ""}
              </div>
              {a.active && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <button className="btn sm p" data-pay={a._id} onClick={() => pay(a, false)}>Pay fee (demo)</button>
                  <button className="btn sm" data-fail={a._id} onClick={() => pay(a, true)}>Test failed payment</button>
                  <button className="btn sm" data-rs={a._id} onClick={() => setResched(a)}>Reschedule</button>
                  <button className="btn sm d" data-cx={a._id} onClick={() => cancel(a)}>Cancel</button>
                </div>
              )}
            </div>
            <JourneyTracker steps={aptSteps(a)} />
          </div>
        ))}
      </div>

      <h2 style={h2}>Prescription requests</h2>
      <div id="rxs">
        {!data && <p className="empty">Loading…</p>}
        {data && data.rxs.length === 0 && <p className="empty">No prescription requests. <Link to="/pharmacy" style={linkStyle}>Upload one</Link></p>}
        {data && data.rxs.map((p) => (
          <div className="card" key={p._id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <b className="j" style={{ color: "var(--ink)" }}>Request #{p._id.slice(-6).toUpperCase()}</b>{" "}
                <span className={"stat" + (p.status === "rejected" ? " x" : "")}>{p.status.replace("_", " ")}</span><br />
                {p.medicines.map((m) => m.name).join(", ") || "No medicines listed yet"}
                {p.staffNote && <><br /><small style={{ color: "var(--mute)" }}>Staff note: {p.staffNote}</small></>}
              </div>
              <Link className="btn sm" to={"/pharmacy?id=" + p._id}>Open</Link>
            </div>
            <JourneyTracker steps={rxSteps(p)} />
          </div>
        ))}
      </div>

      <h2 style={h2}>Payment history</h2>
      <div className="card" id="pays">
        {!data && <p className="empty">Loading…</p>}
        {data && data.pays.length === 0 && <p className="empty">No payments yet.</p>}
        {data && data.pays.length > 0 && (
          <table>
            <thead><tr><th>Date</th><th>For</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {data.pays.map((p) => (
                <tr key={p._id}><td>{fmtTime(p.createdAt)}</td><td>{p.kind}</td><td>₹{p.amount}</td>
                  <td><span className={"stat" + (p.status === "failed" ? " x" : "")}>{p.status}</span></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {resched && <RescheduleModal appt={resched} onClose={() => setResched(null)}
        onDone={() => { setResched(null); toast("Rescheduled"); load(); }} />}
    </main>
  );
}

function RescheduleModal({ appt, onClose, onDone }) {
  const toast = useToast();
  const [date, setDate] = useState("");
  const [free, setFree] = useState([]);
  const [time, setTime] = useState("");

  useEffect(() => {
    if (!date) return;
    let ignore = false;
    api(`/doctors/${appt.doctor._id}/slots?date=${date}`).then((s) => { if (!ignore) { setFree(s); setTime(s[0] || ""); } }).catch(() => !ignore && setFree([]));
    return () => { ignore = true; };
  }, [date, appt]);

  const save = async () => {
    try { await api(`/appointments/${appt._id}/reschedule`, { method: "PATCH", body: { date, time } }); onDone(); }
    catch (e) { toast(e.message, true); }
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal-box" role="dialog" aria-modal="true" aria-label="Reschedule">
        <h3 className="j" style={{ marginBottom: 12 }}>Reschedule</h3>
        <label htmlFor="rd">New date</label>
        <input type="date" id="rd" min={localDate()} value={date} onChange={(e) => setDate(e.target.value)} />
        <label htmlFor="rt">Free slots</label>
        <select id="rt" value={time} onChange={(e) => setTime(e.target.value)}>
          {free.length ? free.map((t) => <option key={t}>{t}</option>) : <option value="">{date ? "No free slots" : "Pick a date first"}</option>}
        </select>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn p" disabled={!date || !time} onClick={save}>Reschedule</button>
        </div>
      </div>
    </div>
  );
}
