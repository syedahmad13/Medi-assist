import { Route, Routes, useLocation } from "react-router-dom";
import Footer from "./components/Footer.jsx";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Doctors from "./pages/Doctors.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Pharmacy from "./pages/Pharmacy.jsx";
import Register from "./pages/Register.jsx";
import Staff from "./pages/Staff.jsx";

export default function App() {
  const { pathname } = useLocation();
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/doctors" element={<Doctors />} />
        <Route path="/pharmacy" element={<ProtectedRoute><Pharmacy /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute role="patient"><Dashboard /></ProtectedRoute>} />
        <Route path="/staff" element={<ProtectedRoute role="staff"><Staff /></ProtectedRoute>} />
        <Route path="*" element={<main className="w pg"><h1>Page not found</h1></main>} />
      </Routes>
      <Footer full={pathname === "/"} />
    </>
  );
}
