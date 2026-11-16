// Experiment 1: a plain HTML + CSS + XML + JavaScript page (no framework).
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// escape text before putting it in innerHTML
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

(async () => {
  const text = (el, tag) => (el.querySelector(tag) || {}).textContent || "";
  let xml;
  try {
    const r = await fetch("doctors.xml");
    if (!r.ok) throw new Error("HTTP " + r.status);
    xml = new DOMParser().parseFromString(await r.text(), "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("The XML file is not well-formed");
  } catch (e) { $("#list").innerHTML = `<p class="empty">Could not load the directory: ${esc(e.message)}</p>`; return; }

  const deps = [...xml.querySelectorAll("department")].map((d) => ({ name: d.getAttribute("name"), about: text(d, "description") }));
  const docs = [...xml.querySelectorAll("doctor")].map((d) => ({
    dept: d.getAttribute("department"), name: text(d, "name"), q: text(d, "qualification"),
    years: text(d, "experienceYears"), fee: text(d, "fee"),
    slots: [...d.querySelectorAll("slot")].map((s) => `${s.getAttribute("day")} ${s.getAttribute("from")}–${s.getAttribute("to")}`),
  }));

  let current = "";
  const draw = () => {
    const shown = docs.filter((d) => !current || d.dept === current);
    $("#list").innerHTML = shown.map((d) => `
      <div class="card doc">
        <span class="pill">${esc(d.dept)}</span>
        <h3 style="margin-top:10px">${esc(d.name)}</h3>
        <div class="q">${esc(d.q)} · ${esc(d.years)} years experience · ₹${esc(d.fee)}</div>
        <p style="font-size:13px">${esc(d.slots.join(" · "))}</p>
        <a class="btn sm p" style="margin-top:12px" href="/doctors?dept=${encodeURIComponent(d.dept)}">Book</a>
      </div>`).join("") || '<p class="empty">No doctors in this department.</p>';
  };
  $("#dep").innerHTML = `<span class="on" data-d="">All</span>` + deps.map((d) => `<span data-d="${esc(d.name)}" title="${esc(d.about)}">${esc(d.name)}</span>`).join("");
  $("#dep").onclick = (e) => {
    const c = e.target.closest("span"); if (!c) return;
    current = c.dataset.d;
    $$("#dep span").forEach((x) => x.classList.toggle("on", x === c));
    draw();
  };
  draw();
})();
