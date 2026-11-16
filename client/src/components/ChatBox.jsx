import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../services/api.js";

const GREETING = {
  role: "model",
  text: "Hi, I'm the Hospital Concierge. Tell me what you're feeling and I'll suggest a department and find you a slot. I can't diagnose or suggest medicines.",
};

// The Concierge. Keeps the conversation in state and sends it to /api/concierge.
export default function ChatBox() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([GREETING]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);

  useEffect(() => { logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || busy) return;
    setText("");
    if (!user) {
      setMessages((m) => [...m, { role: "user", text: content }, { role: "model", text: "Please log in first so I can book for you." }]);
      return;
    }
    const next = [...messages, { role: "user", text: content }];
    setMessages(next);
    setBusy(true);
    try {
      // the greeting is ours, not part of the conversation the AI should see
      const r = await api("/concierge", { method: "POST", body: { messages: next.filter((m) => m !== GREETING) } });
      setMessages((m) => [...m, { role: "model", text: r.reply, emergency: !!r.emergency }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "model", text: err.message }]);
    }
    setBusy(false);
  };

  return (
    <div className="card chat" id="concierge">
      <div className="top">Hospital Concierge <span className="pill">AI</span></div>
      <div className="log" ref={logRef} aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={"bub " + (m.role === "user" ? "me" : "ai") + (m.emergency ? " emg" : "")}>{m.text}</div>
        ))}
        {busy && <div className="bub ai">Thinking…</div>}
      </div>
      <form onSubmit={send}>
        <input aria-label="Message" placeholder="e.g. I have knee pain, who should I see?" maxLength={500} autoComplete="off"
          value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn p" disabled={busy}>Send</button>
      </form>
    </div>
  );
}
