import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";

export default function Register() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      login(await api("/auth/register", { method: "POST", body: form }));
      navigate("/", { replace: true });
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <main className="w">
      <form className="card auth" onSubmit={submit} noValidate>
        <h1>Create your account</h1>
        <p style={{ marginBottom: 20 }}>Patients register here. Staff accounts are created by the hospital.</p>
        <label htmlFor="n">Full name</label>
        <input id="n" name="name" autoComplete="name" required value={form.name} onChange={change} />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required value={form.email} onChange={change} />
        <label htmlFor="ph">Phone (optional)</label>
        <input id="ph" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={change} />
        <label htmlFor="pw">Password (8+ characters)</label>
        <input id="pw" name="password" type="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={change} />
        <div className="err" role="alert">{error}</div>
        <button className="btn p" id="go" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>Register</button>
        <p style={{ marginTop: 16, fontSize: 14 }}>Already registered? <Link to="/login" style={{ color: "var(--p)", fontWeight: 600 }}>Log in</Link></p>
      </form>
    </main>
  );
}
