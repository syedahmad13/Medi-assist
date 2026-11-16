// Editable medicine list (controlled inputs). `rows` is owned by the parent page.
// Numbers can arrive as null from the AI, so show them as "" to keep the inputs controlled.
const FIELDS = [
  ["name", "Medicine", "text"], ["dosage", "Dosage", "text"],
  ["timesPerDay", "/day", "number"], ["days", "days", "number"], ["quantity", "qty", "number"],
];
let counter = 0;
export const newRow = (m = {}) => ({ k: ++counter, name: m.name ?? "", dosage: m.dosage ?? "", timesPerDay: m.timesPerDay ?? "", days: m.days ?? "", quantity: m.quantity ?? "" });

// what the API expects: drop the helper key and empty rows, numbers or null
export const rowsToMedicines = (rows) => rows.filter((r) => r.name.trim()).map((r) => ({
  name: r.name.trim(), dosage: String(r.dosage).trim() || null,
  timesPerDay: r.timesPerDay === "" ? null : Number(r.timesPerDay),
  days: r.days === "" ? null : Number(r.days),
  quantity: r.quantity === "" ? null : Number(r.quantity),
}));

export default function MedicineRows({ rows, setRows }) {
  const change = (k, field, value) => setRows((list) => list.map((r) => (r.k === k ? { ...r, [field]: value } : r)));
  return (
    <div id="rows">
      {rows.map((r) => (
        <div className="rxrow" key={r.k} style={{ marginBottom: 8 }}>
          {FIELDS.map(([f, label, type]) => (
            <input key={f} aria-label={label} placeholder={label} type={type} min={type === "number" ? 0 : undefined}
              data-k={f} value={r[f]} onChange={(e) => change(r.k, f, e.target.value)} />
          ))}
          <button type="button" className="btn sm d" aria-label="Remove" data-del onClick={() => setRows((list) => list.filter((x) => x.k !== r.k))}>✕</button>
        </div>
      ))}
    </div>
  );
}
