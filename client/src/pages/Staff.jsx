import { useState } from "react";
import AppointmentsAdmin from "./staff/AppointmentsAdmin.jsx";
import DepartmentsAdmin from "./staff/DepartmentsAdmin.jsx";
import DoctorsAdmin from "./staff/DoctorsAdmin.jsx";
import RxReview from "./staff/RxReview.jsx";

const TABS = [
  ["rx", "Prescription review", RxReview],
  ["deps", "Departments", DepartmentsAdmin],
  ["docs", "Doctors", DoctorsAdmin],
  ["appts", "Appointments", AppointmentsAdmin],
];

export default function Staff() {
  const [tab, setTab] = useState("rx");
  const Active = TABS.find(([id]) => id === tab)[2];
  return (
    <main className="w pg">
      <h1>Staff dashboard</h1>
      <div className="tabs" id="tabs">
        {TABS.map(([id, label]) => <button key={id} data-t={id} className={id === tab ? "on" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <section style={{ padding: "16px 0 0" }}><Active /></section>
    </main>
  );
}
