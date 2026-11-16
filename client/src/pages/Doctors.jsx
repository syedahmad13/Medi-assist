import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { api } from "../services/api.js";
import { localDate } from "../utils/helpers.js";

export default function Doctors() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [departments, setDepartments] = useState([]);
  const [deptId, setDeptId] = useState("");
  const [ready, setReady] = useState(false); // departments loaded, so the ?dept= filter can apply
  const [date, setDate] = useState(localDate());
  const [doctors, setDoctors] = useState(null); // null = loading
  const [slots, setSlots] = useState({}); // doctorId -> ["10:00", ...]
  const [pick, setPick] = useState(null); // { doctor, time }
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  // departments once; ?dept=Name (from the landing page) picks the filter
  useEffect(() => {
    let ignore = false;
    api("/departments").then((list) => {
      if (ignore) return;
      setDepartments(list);
      const want = list.find((d) => d.name === params.get("dept"));
      if (want) setDeptId(want._id);
      setReady(true);
    }).catch(() => !ignore && setReady(true));
    return () => { ignore = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // doctors + their free slots whenever the filter or date changes.
  // `ignore` drops the answer of an older request so a slow one cannot overwrite a newer one.
  useEffect(() => {
    if (!ready) return;
    let ignore = false;
    setPick(null);
    (async () => {
      try {
        const list = await api("/doctors" + (deptId ? "?department=" + deptId : ""));
        const free = await Promise.all(list.map((d) => api(`/doctors/${d._id}/slots?date=${date}`).catch(() => [])));
        if (ignore) return;
        setDoctors(list);
        setSlots(Object.fromEntries(list.map((d, i) => [d._id, free[i]])));
      } catch (err) { if (!ignore) { setDoctors([]); toast(err.message, true); } }
    })();
    return () => { ignore = true; };
  }, [ready, deptId, date, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const book = async () => {
    if (!user) { navigate("/login?next=" + encodeURIComponent("/doctors")); return; }
    setBusy(true);
    try {
      await api("/appointments", { method: "POST", body: { doctor: pick.doctor._id, date, time: pick.time, reason: reason.trim() } });
      toast("Appointment booked. A confirmation is in your alerts.");
      setTimeout(() => navigate("/dashboard"), 1200);
    } catch (err) {
      toast(err.message, true);
      setReload((n) => n + 1); // the slot may have just been taken
      setBusy(false);
    }
  };

  return (
    <>
      <div className="bar"><div className="w"><Link to="/">Home</Link> / Doctors &amp; appointments</div></div>
      <main className="w pg">
        <h1>Find a doctor and book a slot</h1>
        <p>Pick a department and a date, then choose one of the free slots.</p>

        <div style={{ display: "flex", gap: 16, alignItems: "end", flexWrap: "wrap", marginTop: 20 }}>
          <div>
            <label htmlFor="date">Date</label>
            <input type="date" id="date" min={localDate()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ marginBottom: 0, width: "auto" }} />
          </div>
        </div>

        <div className="chips f" id="dep">
          {[{ _id: "", name: "All" }, ...departments].map((d) => (
            <span key={d._id || "all"} className={d._id === deptId ? "on" : ""} role="button" tabIndex={0}
              onClick={() => setDeptId(d._id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setDeptId(d._id)}>{d.name}</span>
          ))}
        </div>

        <div className="two">
          <div id="list">
            {doctors === null && <p className="empty">Loading doctors…</p>}
            {doctors && doctors.length === 0 && <p className="empty">No doctors in this department yet.</p>}
            {doctors && doctors.map((d) => (
              <div className="card doc" key={d._id}>
                <h3>{d.name}</h3>
                <div className="q">{d.qualification} · {d.department.name}{d.experienceYears ? ` · ${d.experienceYears} years experience` : ""} · ₹{d.fee}</div>
                {slots[d._id]?.length ? (
                  <div className="slots">
                    {slots[d._id].map((t) => (
                      <div key={t} role="button" tabIndex={0} data-t={t}
                        className={"slot" + (pick && pick.doctor._id === d._id && pick.time === t ? " sel" : "")}
                        onClick={() => setPick({ doctor: d, time: t })}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setPick({ doctor: d, time: t }))}>{t}</div>
                    ))}
                  </div>
                ) : <p className="empty" style={{ padding: 0 }}>No free slots on this date.</p>}
              </div>
            ))}
          </div>

          <aside className="card side">
            <h3>Your booking</h3>
            <div className="row"><span>Doctor</span><b>{pick ? pick.doctor.name : "Select a slot"}</b></div>
            <div className="row"><span>Date</span><b>{pick ? date : "–"}</b></div>
            <div className="row"><span>Time</span><b>{pick ? pick.time : "–"}</b></div>
            <div className="row t"><span>Consultation fee</span><span>{pick ? "₹" + pick.doctor.fee : "–"}</span></div>
            <label htmlFor="why" style={{ display: "block", marginTop: 16 }}>Reason for visit</label>
            <textarea id="why" rows={3} maxLength={200} placeholder="e.g. knee pain for two weeks" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn p" id="go" style={{ width: "100%", justifyContent: "center" }} disabled={!pick || busy} onClick={book}>Confirm appointment</button>
            <p style={{ fontSize: 12, color: "var(--mute)", marginTop: 10 }}>A slot can only be booked once. You can cancel or reschedule from your dashboard.</p>
          </aside>
        </div>
      </main>
    </>
  );
}
