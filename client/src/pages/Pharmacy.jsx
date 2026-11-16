import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import JourneyTracker from "../components/JourneyTracker.jsx";
import MedicineRows, { newRow, rowsToMedicines } from "../components/MedicineRows.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { api, fetchImageUrl } from "../services/api.js";
import { fmtTime } from "../utils/helpers.js";
import { rxSteps } from "../utils/journey.js";

const EDITABLE = ["uploaded", "ai_read"];

export default function Pharmacy() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const selId = params.get("id");

  const load = useCallback(async () => {
    const mine = await api("/prescriptions");
    setList(mine);
    return mine;
  }, []);

  useEffect(() => {
    load().then((mine) => { if (!params.get("id") && mine.length) setParams({ id: mine[0]._id }, { replace: true }); })
      .catch((e) => toast(e.message, true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async () => {
    if (!file) return toast("Choose a photo first", true);
    const form = new FormData();
    form.append("image", file);
    setUploading(true);
    try {
      const p = await api("/prescriptions", { method: "POST", form });
      toast(p.status === "ai_read" ? `AI found ${p.medicines.length} medicine(s). Please check them.` : (p.staffNote || "Enter the medicines manually"));
      await load();
      setParams({ id: p._id });
      setFile(null);
    } catch (e) { toast(e.message, true); }
    setUploading(false);
  };

  const selected = list && list.find((p) => p._id === selId);

  return (
    <>
      <div className="bar"><div className="w"><Link to="/">Home</Link> / Pharmacy</div></div>
      <main className="w pg">
        <h1>Your prescriptions</h1>
        <p>Upload a photo. AI lists the medicines, you check them, and pharmacy staff approve before anything is given out.</p>

        <div className="two">
          <div>
            <div className="card">
              <h3 style={{ fontSize: 18, marginBottom: 14 }}>Upload a prescription</h3>
              <div className="up">
                <p><b className="j" style={{ color: "var(--ink)" }}>Choose a photo of your prescription</b></p>
                <p style={{ fontSize: 13, color: "var(--mute)", margin: "4px 0 14px" }}>JPG, PNG or WebP, up to 5 MB. Make sure the writing is clear.</p>
                <input type="file" id="file" accept="image/jpeg,image/png,image/webp" style={{ maxWidth: 300, margin: "0 auto", background: "#fff" }}
                  onChange={(e) => setFile(e.target.files[0] || null)} />
                <button className="btn p" id="upload" style={{ marginTop: 8 }} onClick={upload} disabled={uploading}>{uploading ? "Reading…" : "Upload and read"}</button>
              </div>
            </div>
            {selected && <Detail key={selected._id} p={selected} onChanged={load} />}
          </div>

          <aside className="side">
            <h3 className="j" style={{ fontSize: 18, marginBottom: 12 }}>My requests</h3>
            <div id="mine">
              {!list && <p className="empty">Loading…</p>}
              {list && list.length === 0 && <p className="empty">Nothing uploaded yet.</p>}
              {list && list.map((p) => (
                <div key={p._id} className={"listrow" + (p._id === selId ? " on" : "")} onClick={() => setParams({ id: p._id })}>
                  <b className="j" style={{ color: "var(--ink)" }}>#{p._id.slice(-6).toUpperCase()}</b>{" "}
                  <span className={"stat" + (p.status === "rejected" ? " x" : "")}>{p.status.replace("_", " ")}</span>
                  <br /><small style={{ color: "var(--mute)" }}>{fmtTime(p.createdAt)}</small>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

// one request: tracker, photo, medicine list, send / pay
function Detail({ p, onChanged }) {
  const toast = useToast();
  const edit = EDITABLE.includes(p.status);
  const [rows, setRows] = useState(() => (p.medicines.length ? p.medicines : [{}]).map(newRow));
  const [photo, setPhoto] = useState(null);
  const [amount, setAmount] = useState("228");

  // the photo needs the login token; revoke the blob URL when we leave
  useEffect(() => {
    let url = null, ignore = false;
    fetchImageUrl(`/prescriptions/${p._id}/image`).then((u) => { if (ignore) u && URL.revokeObjectURL(u); else { url = u; setPhoto(u); } }).catch(() => {});
    return () => { ignore = true; if (url) URL.revokeObjectURL(url); };
  }, [p._id]);

  const send = async () => {
    try {
      await api(`/prescriptions/${p._id}/send`, { method: "PATCH", body: { medicines: rowsToMedicines(rows) } });
      toast("Sent to the pharmacy for review");
      onChanged();
    } catch (e) { toast(e.message, true); }
  };

  const pay = async (fail) => {
    try {
      await api("/payments/pay", { method: "POST", body: { kind: "pharmacy", prescriptionId: p._id, amount: Number(amount), simulate: fail ? "fail" : "success" } });
      toast("Payment successful (demo)");
    } catch (e) { if (e.status === 402) toast("Payment failed (demo)", true); else toast(e.message, true); }
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div className="card" style={{ padding: 28 }}>
        <JourneyTracker steps={rxSteps(p)} />
        {p.staffNote && <div className="note">Note: {p.staffNote}</div>}
        {p.status === "ready" && <div className="note" style={{ background: "var(--mint)" }}>Your medicines are ready. Collect them at the hospital pharmacy.</div>}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 18 }}>Medicines</h3>
        <p style={{ fontSize: 13, color: "var(--mute)", marginBottom: 12 }}>{edit ? "AI may make mistakes. Check every line against your photo." : "Locked while staff review it."}</p>
        <img id="photo" alt="Your prescription" src={photo || undefined}
          style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 10, border: "1px solid var(--line)", marginBottom: 16, display: photo ? "block" : "none" }} />
        {edit ? (
          <>
            <MedicineRows rows={rows} setRows={setRows} />
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn sm" id="add" type="button" onClick={() => setRows((r) => [...r, newRow()])}>Add medicine</button>
              <button className="btn p" id="send" onClick={send}>Send to pharmacy</button>
            </div>
          </>
        ) : p.medicines.map((m, i) => (
          <div className="med" key={i}>
            <div><b>{m.name}</b><small>{m.dosage || ""} · {m.timesPerDay ?? "?"}/day · {m.days ?? "?"} days</small></div>
            <span>{m.quantity ?? "?"} qty</span>
          </div>
        ))}
      </div>

      {p.status === "ready" && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 18 }}>Pharmacy bill (demo payment)</h3>
          <label htmlFor="amt">Bill amount (₹)</label>
          <input id="amt" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ maxWidth: 160 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn p" id="pay" onClick={() => pay(false)}>Pay (demo)</button>
            <button className="btn" id="payfail" onClick={() => pay(true)}>Test failed payment</button>
          </div>
        </div>
      )}
    </div>
  );
}
