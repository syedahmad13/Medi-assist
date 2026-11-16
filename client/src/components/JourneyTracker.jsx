// The progress line ("track it like a parcel"). `steps` come from utils/journey.js.
export default function JourneyTracker({ steps }) {
  return (
    <div className="steps" style={{ "--n": steps.length }}>
      {steps.map((s, i) => (
        <div key={s.label} className={"st " + s.state}>
          <i>{s.state === "done" ? "✓" : s.state === "bad" ? "✕" : i + 1}</i>
          <b>{s.label}</b>{s.detail}
        </div>
      ))}
    </div>
  );
}
