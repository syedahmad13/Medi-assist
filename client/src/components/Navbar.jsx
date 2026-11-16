import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import NotificationBell from "./NotificationBell.jsx";

const active = ({ isActive }) => (isActive ? { color: "var(--p)" } : undefined);

export default function Navbar() {
  const { user, logout } = useAuth();
  return (
    <nav>
      <div className="w">
        <Link className="logo" to="/"><img src="/logo.svg" alt="" width="32" height="32" />MediAssist</Link>
        <div className="links">
          <NavLink to="/doctors" style={active}>Doctors</NavLink>
          <Link to="/#departments">Departments</Link>
          <NavLink to="/pharmacy" style={active}>Pharmacy</NavLink>
          <Link to="/#concierge">Concierge</Link>
        </div>
        <div className="nr">
          <span className="sos">Emergency: 108</span>
          {user ? (
            <>
              <NotificationBell />
              <Link className="btn" to={user.role === "staff" ? "/staff" : "/dashboard"}>{user.name.split(" ")[0]}</Link>
              <button className="btn p" id="out" onClick={logout}>Logout</button>
            </>
          ) : (
            <>
              <Link className="btn" to="/login">Login</Link>
              <Link className="btn p" to="/register">Register</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
