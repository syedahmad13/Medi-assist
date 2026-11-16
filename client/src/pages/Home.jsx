import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import ChatBox from "../components/ChatBox.jsx";
import JourneyTracker from "../components/JourneyTracker.jsx";

const FEATURES = [
  { icon: "▦", title: "Patient Dashboard", text: "Your appointments, prescriptions and requests together after you log in.", to: "/dashboard", link: "Open dashboard →" },
  { icon: "⌕", title: "Find Doctors by Department", text: "Browse doctors by department with qualification, experience and timings.", to: "/doctors", link: "Browse doctors →" },
  { icon: "▣", title: "Appointment Booking", text: "Pick a department, doctor and date. See only free slots. No double bookings.", to: "/doctors", link: "Check available slots →" },
  { icon: "℞", title: "AI Rx with Pharmacist Review", text: "Upload a photo. AI lists the medicines. Pharmacy staff check it before anything is approved.", to: "/pharmacy", link: "Upload a prescription →" },
  { icon: "✦", title: "AI Hospital Concierge", text: "Ask in plain language. It suggests a department and can book a slot for you.", to: "/#concierge", link: "Start chatting →" },
  { icon: "◔", title: "Notifications & Reminders", text: "Booking confirmations, reminders a day and an hour before, and medicine-ready alerts.", to: "/dashboard", link: "Open your alerts →" },
];

const DEPARTMENTS = [
  ["Cardiology", "Heart care, ECG, echo and preventive cardiology.", "Book Cardiology OPD"],
  ["ENT", "Ear, nose and throat: sinus, hearing and voice assessment.", "Book ENT OPD"],
  ["Orthopaedics", "Joint and spine care, fractures and rehabilitation.", "Book Ortho OPD"],
  ["Dermatology", "Skin, hair and nail conditions, eczema and acne.", "Book Derma OPD"],
  ["Pediatrics", "Child health, vaccination and growth checks.", "Book Pediatrics OPD"],
  ["General Medicine", "Fever, infections, blood pressure and diabetes care.", "Book General Medicine"],
];

const HOW = [
  ["01", "Register", "Create your patient account with a password."],
  ["02", "Find Doctor", "Choose a department or ask the Concierge about your symptoms."],
  ["03", "Book & Upload Rx", "Pick a free slot and upload your prescription photo."],
  ["04", "Collect Medicines", "Get the ready alert and collect at the hospital pharmacy."],
];

const SAMPLE = [
  { label: "Uploaded", detail: "Photo received", state: "done" },
  { label: "AI read", detail: "4 medicines found", state: "done" },
  { label: "Staff reviewing", detail: "In progress", state: "now" },
  { label: "Ready for pickup", detail: "Pending", state: "todo" },
  { label: "Collected", detail: "Pending", state: "todo" },
];

export default function Home() {
  // React Router does not scroll to #anchors by itself
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <>
      <header className="hero">
        <div className="w">
          <div>
            <span className="pill">Appointments · Pharmacy · Concierge</span>
            <h1>Your hospital front desk and pharmacy, <em>online</em></h1>
            <p>Find the right doctor, book a free slot, upload your prescription for pharmacy review, and track every request from one place.</p>
            <div className="ctas">
              <Link className="btn p" to="/doctors">Book Appointment</Link>
              <Link className="btn s" to="/pharmacy">Upload Prescription</Link>
            </div>
          </div>
          <ChatBox />
        </div>
      </header>

      <section>
        <div className="w">
          <div className="head"><span className="pill">What you can do</span><h2>Everything a visit needs, in one place</h2><p>From finding a doctor to collecting medicines, each step is online and every step is visible.</p></div>
          <div className="g3">
            {FEATURES.map((f) => (
              <div className="card feat" key={f.title}>
                <div className="ic">{f.icon}</div><h3>{f.title}</h3><p>{f.text}</p>
                <Link to={f.to}>{f.link}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "var(--wash)" }}>
        <div className="w">
          <div className="head"><span className="pill">Journey tracking</span><h2>Track every request like a parcel</h2><p>Each status change is logged with the step, the time and the staff member.</p></div>
          <div className="card trk">
            <div className="meta"><span><b className="j" style={{ color: "var(--ink)" }}>Rx #MA-84920</b> &nbsp;<span className="pill">In progress</span></span><span>Sample request</span></div>
            <JourneyTracker steps={SAMPLE} />
            <div className="note">Nothing is given out until pharmacy staff approve it.</div>
          </div>
        </div>
      </section>

      <section id="departments">
        <div className="w">
          <div className="head"><span className="pill">Departments</span><h2>Explore clinical departments</h2><p>Choose a department to see its doctors and free slots.</p></div>
          <div className="g3">
            {DEPARTMENTS.map(([name, text, cta]) => (
              <div className="card dept" key={name}>
                <h3>{name}</h3><p>{text}</p>
                <Link className="go" to={"/doctors?dept=" + encodeURIComponent(name)}>{cta}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "var(--wash)" }}>
        <div className="w how">
          <div className="head"><span className="pill">How it works</span><h2>Four steps, no queue at the counter</h2></div>
          <div className="g4">
            {HOW.map(([n, title, text]) => <div className="card" key={n}><div className="n">{n}</div><h3>{title}</h3><p>{text}</p></div>)}
          </div>
        </div>
      </section>

      <section style={{ padding: 0 }}>
        <div className="w" style={{ paddingTop: 80 }}>
          <div className="em">
            <div>
              <h3>Emergency? Call 108 or go directly to the hospital Emergency ward.</h3>
              <p>The Concierge never handles emergencies. Chest pain or severe symptoms: go to Emergency now.</p>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><a className="btn" href="tel:108">Call 108</a></div>
          </div>
        </div>
      </section>
    </>
  );
}
