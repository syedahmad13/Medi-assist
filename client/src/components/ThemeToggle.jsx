import { useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const flip = () => {
    const t = dark ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch { /* private mode: still works for this visit */ }
    setDark(!dark);
  };
  return (
    <button className="btn tt" id="theme" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={flip}>
      {dark ? "Light" : "Dark"}
    </button>
  );
}
