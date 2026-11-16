import { Link } from "react-router-dom";

export default function Footer({ full = false }) {
  return (
    <footer>
      <div className="w">
        {full && (
          <div className="fg">
            <div>
              <Link className="logo" to="/"><img src="/logo.svg" alt="" width="32" height="32" />MediAssist</Link>
              <p style={{ marginTop: 12, color: "var(--mute)", maxWidth: 300 }}>Online hospital reception, scheduling and pharmacy requests.</p>
            </div>
            <div><h4>Patients</h4><ul><li><Link to="/doctors">Book appointment</Link></li><li><Link to="/pharmacy">Upload prescription</Link></li><li><Link to="/dashboard">Track request</Link></li></ul></div>
            <div><h4>Hospital</h4><ul><li><a href="/hospital.html">Hospital directory</a></li><li><Link to="/doctors">Doctors</Link></li><li><Link to="/#concierge">Concierge</Link></li></ul></div>
            <div><h4>Legal</h4><ul><li>Privacy notice</li><li>Terms of service</li></ul></div>
          </div>
        )}
        <div className="bot" style={full ? undefined : { margin: 0, padding: 0, border: 0 }}>
          <span>© 2026 MediAssist. Student project.</span>
          <span>Health data is handled in line with India's DPDP Act 2023.</span>
        </div>
      </div>
    </footer>
  );
}
