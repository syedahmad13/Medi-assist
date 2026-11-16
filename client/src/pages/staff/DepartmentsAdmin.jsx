import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../context/ToastContext.jsx";
import { api } from "../../services/api.js";

// departments: list + add / edit / delete (CRUD)
export default function DepartmentsAdmin() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null); // department being edited, or null = adding
  const [form, setForm] = useState({ name: "", description: "" });

  const load = useCallback(() => api("/departments").then(setList).catch((e) => toast(e.message, true)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const reset = () => { setEditing(null); setForm({ name: "", description: "" }); };
  const edit = (d) => { setEditing(d); setForm({ name: d.name, description: d.description || "" }); };

  const save = async (e) => {
    e.preventDefault();
    const body = { name: form.name.trim(), description: form.description.trim() };
    try {
      await api(editing ? `/departments/${editing._id}` : "/departments", { method: editing ? "PUT" : "POST", body });
      toast("Saved"); reset(); load();
    } catch (err) { toast(err.message, true); }
  };
  const remove = async (d) => {
    if (!confirm("Delete this department?")) return;
    try { await api(`/departments/${d._id}`, { method: "DELETE" }); toast("Deleted"); load(); }
    catch (err) { toast(err.message, true); }
  };

  return (
    <div className="two">
      <div className="card">
        {list && list.length === 0 && <p className="empty">No departments yet.</p>}
        {list && list.length > 0 && (
          <table>
            <thead><tr><th>Name</th><th>Description</th><th></th></tr></thead>
            <tbody>
              {list.map((d) => (
                <tr key={d._id}><td>{d.name}</td><td>{d.description || ""}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn sm" data-edd={d._id} onClick={() => edit(d)}>Edit</button>{" "}
                    <button className="btn sm d" data-rmd={d._id} onClick={() => remove(d)}>Delete</button>
                  </td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <form className="card side" id="depf" onSubmit={save}>
        <h3>{editing ? "Edit department" : "Add department"}</h3>
        <label htmlFor="depn">Name</label>
        <input id="depn" required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label htmlFor="depd">Description</label>
        <textarea id="depd" rows={3} maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button className="btn p" style={{ width: "100%", justifyContent: "center" }}>{editing ? "Save changes" : "Add department"}</button>
        {editing && <button type="button" className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={reset}>Cancel edit</button>}
      </form>
    </div>
  );
}
