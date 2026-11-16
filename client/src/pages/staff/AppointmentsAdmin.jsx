import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../context/ToastContext.jsx";
import { api } from "../../services/api.js";

const NEXT = { booked: ["confirmed", "Confirm"], confirmed: ["completed", "Mark done"] };

export default function AppointmentsAdmin() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const load = useCallback(() => api("/appointments").then(setList).catch((e) => toast(e.message, true)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const move = async (a, status) => {
    try { await api(`/appointments/${a._id}/status`, { method: "PATCH", body: { status } }); load(); }
    catch (e) { toast(e.message, true); }
  };

  return (
    <div className="card">
      {list && list.length === 0 && <p className="empty">No appointments.</p>}
      {list && list.length > 0 && (
        <table>
          <thead><tr><th>Patient</th><th>Doctor</th><th>When</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map((a) => (
              <tr key={a._id}>
                <td>{a.patient ? a.patient.name : ""}</td><td>{a.doctor ? a.doctor.name : "removed"}</td><td>{a.date} {a.time}</td>
                <td><span className={"stat" + (a.status === "cancelled" ? " x" : "")}>{a.status}</span></td>
                <td>{NEXT[a.status] && <button className="btn sm p" onClick={() => move(a, NEXT[a.status][0])}>{NEXT[a.status][1]}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
