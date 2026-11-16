import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../services/api.js";
import { fmtTime } from "../utils/helpers.js";

// the "Alerts" bell: loads notifications now and then once a minute
export default function NotificationBell() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);

  const { pathname } = useLocation();
  const load = useCallback(() => api("/notifications").then(setList).catch(() => {}), []);

  // reload on every page change too: the app no longer reloads the page when you move around
  useEffect(() => {
    load();
  }, [load, pathname]);

  useEffect(() => {
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer); // StrictMode mounts twice in dev, so always clean up
  }, [load]);

  // click anywhere else closes the list
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!e.target.closest(".bellw")) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const unread = list.filter((n) => !n.read).length;
  const markRead = async (n) => {
    if (n.read) return;
    await api(`/notifications/${n._id}/read`, { method: "PATCH" }).catch(() => {});
    load();
  };

  return (
    <div className="bellw">
      <button className="btn" id="bell" aria-label="Notifications" onClick={() => { setOpen((o) => !o); load(); }}>
        Alerts {unread > 0 && <span id="bc" className="cnt">{unread}</span>}
      </button>
      {open && (
        <div id="bl" className="bl">
          {list.length === 0 && <div className="ni">No alerts yet</div>}
          {list.slice(0, 8).map((n) => (
            <div key={n._id} className={"ni" + (n.read ? "" : " un")} onClick={() => markRead(n)}>
              {n.message}<small>{fmtTime(n.sendAt)}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
