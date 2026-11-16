import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// role="staff"   -> staff only (patients go to /dashboard)
// role="patient" -> patients only (staff go to /staff)
// no role        -> any logged-in user
export default function ProtectedRoute({ role, children }) {
  const { user } = useAuth();
  const here = useLocation();
  if (!user) return <Navigate to={"/login?next=" + encodeURIComponent(here.pathname + here.search)} replace />;
  if (role === "staff" && user.role !== "staff") return <Navigate to="/dashboard" replace />;
  if (role === "patient" && user.role === "staff") return <Navigate to="/staff" replace />;
  return children;
}
