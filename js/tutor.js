// "Dein Lehrer" — chat sheet backed by the Cloudflare Worker proxy
// (cloudflare/worker.js). The worker holds the Gemini key and the
// German-teacher-only system prompt; this file is just UI + transport.

import { state, save, h, openSheet, esc } from "./core.js";

const HIST_KEY = "dk_tutor_v1";

function loadHist() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY)) || {}; } catch { return {}; }
}
function saveHist(all) {
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(all));
  } catch {
    localStorage.removeItem(HIST_KEY); // cache full -> reset
  }
}

export function tutorConfigured() {
  return /^https:\/\/.+\.workers\.dev/.test(state.settings.tutorUrl || "") ||
    /^https?:\/\//.test(state.settings.tutorUrl || "");
}

// simple markdown-ish rendering for teacher replies
function md(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^- (.*)$/gm, "• $1")
    .replace(/\n/g, "<br>");
}

// openTutor({ key, title, context, chips: [{label, prompt}] })
export function openTutor({ key, title, context, chips = [] }) {
  const all = loadHist();
  const hist = (all[key] = all[key] || []); // [{role:"user"|"model", text}]

  const box = h("div", {});
  const head = h("div", { class: "row" },
    h("div", { class: "grow" },
      h("div", { style: "font-weight:800" }, "💬 Dein Lehrer"),
      h("div", { class: "muted small" }, title)),
  );
  const log = h("div", { style: "max-height:40vh;overflow-y:auto;margin:10px 0" });
  const chipRow = h("div", { class: "chips" });
  const input = h("input", { type: "text", placeholder: "Frage zur deutschen Sprache…", style: "flex:1" });
  const send = h("button", { class: "btn" }, "➤");
  const form = h("div", { class: "row", style: "margin-top:8px" }, input, send);
  box.append(head, log, chipRow, form);

  if (!tutorConfigured()) {
    log.append(h("div", { class: "card small" },
      "Der Lehrer ist noch nicht eingerichtet. Trage unter ",
      h("b", {}, "Plan → Einstellungen → Lehrer-URL"),
      " die Adresse deines Cloudflare Workers ein (Anleitung: docs/TUTOR_SETUP.md im Repo)."));
    input.disabled = send.disabled = true;
    openSheet(box);
    return;
  }

  const bubble = (role, text) =>
    h("div", {
      style: role === "user"
        ? "background:var(--accent-soft);color:var(--ink);border-radius:12px 12px 2px 12px;padding:8px 12px;margin:6px 0 6px 15%;font-size:.92rem"
        : "background:var(--card);border:1px solid var(--line);border-radius:12px 12px 12px 2px;padding:8px 12px;margin:6px 15% 6px 0;font-size:.92rem",
      html: role === "user" ? esc(text) : md(text),
    });

  const redraw = () => {
    log.innerHTML = "";
    if (!hist.length) {
      log.append(h("div", { class: "muted small", style: "padding:6px 0" },
        "Frag mich zu diesem Text — Satzbau, Fälle, Zeitformen, Wortbedeutungen …"));
    }
    for (const m of hist) log.append(bubble(m.role, m.text));
    log.scrollTop = log.scrollHeight;
  };

  let busy = false;
  const ask = async (question) => {
    if (busy || !question.trim()) return;
    busy = true;
    send.disabled = true;
    hist.push({ role: "user", text: question.trim() });
    redraw();
    const thinking = h("div", { class: "muted small", style: "padding:4px 0" }, "… denkt nach");
    log.append(thinking);
    log.scrollTop = log.scrollHeight;
    try {
      const r = await fetch(state.settings.tutorUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, messages: hist.slice(-10) }),
      });
      const data = await r.json();
      hist.push({
        role: "model",
        text: data.text || [data.error, data.detail].filter(Boolean).join(" — ") || "Fehler — versuch es noch einmal.",
      });
    } catch {
      hist.push({
        role: "model",
        text: navigator.onLine
          ? "Der Lehrer ist gerade nicht erreichbar (Worker-URL prüfen?)."
          : "Offline — der Lehrer braucht Internet.",
      });
    }
    // keep history bounded per key and overall
    if (hist.length > 20) hist.splice(0, hist.length - 20);
    const keys = Object.keys(all);
    if (keys.length > 40) delete all[keys[0]];
    saveHist(all);
    busy = false;
    send.disabled = false;
    redraw();
  };

  for (const c of chips) {
    chipRow.append(h("button", { class: "chip", onclick: () => ask(c.prompt) }, c.label));
  }
  send.addEventListener("click", () => { ask(input.value); input.value = ""; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { ask(input.value); input.value = ""; } });

  redraw();
  openSheet(box);
}
