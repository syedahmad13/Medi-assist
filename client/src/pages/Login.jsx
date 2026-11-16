import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";
import { safeNext } from "../utils/helpers.js";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      login(await api("/auth/login", { method: "POST", body: form }));
      navigate(safeNext(params.get("next")), { replace: true });
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <main className="w">
      <form className="card auth" onSubmit={submit} noValidate>
        <h1>Log in</h1>
        <p style={{ marginBottom: 20 }}>Welcome back.</p>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required value={form.email} onChange={change} />
        <label htmlFor="pw">Password</label>
        <input id="pw" name="password" type="password" autoComplete="current-password" required value={form.password} onChange={change} />
        <div className="err" role="alert">{error}</div>
        <button className="btn p" id="go" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>Log in</button>
        <p style={{ marginTop: 16, fontSize: 14 }}>New here? <Link to="/register" style={{ color: "var(--p)", fontWeight: 600 }}>Create an account</Link></p>
      </form>
    </main>
  );
}
