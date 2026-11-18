import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../context/ToastContext.jsx";
import { api } from "../../services/api.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BLANK = { name: "", department: "", qualification: "", experienceYears: "", fee: "500", days: [1, 2, 3, 4, 5], start: "10:00", end: "13:00" };

// doctors: list + add / edit / delete (CRUD). One set of hours is applied to the chosen days.
export default function DoctorsAdmin() {
  const toast = useToast();
  const [doctors, setDoctors] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);

  const load = useCallback(async () => {
    try {
      const [deps, docs] = await Promise.all([api("/departments"), api("/doctors")]);
      setDepartments(deps); setDoctors(docs);
      setForm((f) => (f.department ? f : { ...f, department: deps[0] ? deps[0]._id : "" }));
    } catch (e) { toast(e.message, true); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => { const v = e.target.value; setForm((f) => ({ ...f, [k]: v })); }; // functional: load() sets the department at the same time
  const toggleDay = (i) => setForm((f) => ({ ...f, days: f.days.includes(i) ? f.days.filter((d) => d !== i) : [...f.days, i] }));
  const reset = () => { setEditing(null); setForm({ ...BLANK, department: departments[0] ? departments[0]._id : "" }); };

  const edit = (d) => {
    const a = d.availability[0];
    setEditing(d);
    setForm({
      name: d.name, department: d.department._id, qualification: d.qualification || "", experienceYears: d.experienceYears ?? "", fee: String(d.fee),
      days: d.availability.map((x) => x.weekday), start: a ? a.start : "10:00", end: a ? a.end : "13:00",
    });
  };

  const save = async (e) => {
    e.preventDefault();
    const body = {
      name: form.name.trim(), department: form.department, qualification: form.qualification.trim(),
      experienceYears: Number(form.experienceYears) || 0, fee: Number(form.fee) || 0,
      availability: form.days.map((weekday) => ({ weekday, start: form.start, end: form.end })),
    };
    try {
      await api(editing ? `/doctors/${editing._id}` : "/doctors", { method: editing ? "PUT" : "POST", body });
      toast("Saved"); reset(); load();
    } catch (err) { toast(err.message, true); }
  };
  const remove = async (d) => {
    if (!confirm("Delete this doctor?")) return;
    try { await api(`/doctors/${d._id}`, { method: "DELETE" }); toast("Deleted"); load(); }
    catch (err) { toast(err.message, true); }
  };

  // the form needs the department list, so show it only after loading
  if (!doctors) return <p className="empty">Loading…</p>;

  return (
    <div className="two">
      <div className="card">
        {doctors && (
          <table>
            <thead><tr><th>Name</th><th>Department</th><th>Fee</th><th></th></tr></thead>
            <tbody>
              {doctors.map((d) => (
                <tr key={d._id}><td>{d.name}</td><td>{d.department.name}</td><td>₹{d.fee}</td>
                  <td><button className="btn sm" data-ed={d._id} onClick={() => edit(d)}>Edit</button>{" "}
                    <button className="btn sm d" data-rm={d._id} onClick={() => remove(d)}>Delete</button></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <form className="card side" id="df" onSubmit={save}>
        <h3>{editing ? "Edit doctor" : "Add doctor"}</h3>
        <label htmlFor="dn">Name</label><input id="dn" required value={form.name} onChange={set("name")} />
        <label htmlFor="dd">Department</label>
        <select id="dd" value={form.department} onChange={set("department")}>{departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select>
        <label htmlFor="dq">Qualification</label><input id="dq" value={form.qualification} onChange={set("qualification")} />
        <label htmlFor="dy">Years of experience</label><input id="dy" type="number" min="0" value={form.experienceYears} onChange={set("experienceYears")} />
        <label htmlFor="df2">Fee (₹)</label><input id="df2" type="number" min="0" value={form.fee} onChange={set("fee")} />
        <label>Available days</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "6px 0 14px" }}>
          {DAYS.map((n, i) => (
            <label key={n} style={{ fontWeight: 400 }}>
              <input type="checkbox" style={{ width: "auto", margin: "0 4px 0 0" }} checked={form.days.includes(i)} onChange={() => toggleDay(i)} />{n}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}><label htmlFor="ds">From</label><input id="ds" type="time" value={form.start} onChange={set("start")} /></div>
          <div style={{ flex: 1 }}><label htmlFor="de">To</label><input id="de" type="time" value={form.end} onChange={set("end")} /></div>
        </div>
        <button className="btn p" style={{ width: "100%", justifyContent: "center" }}>{editing ? "Save changes" : "Add doctor"}</button>
        {editing && <button type="button" className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={reset}>Cancel edit</button>}
      </form>
    </div>
  );
}
