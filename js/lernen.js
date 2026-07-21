// Lernen: distilled grammar lessons from the user's saved YouTube playlists.
// Reads data/lessons.json (produced by the transcript->distillation pipeline).

import { state, save, h, loadData, toast, bumpActivity, today, esc } from "./core.js";
import { openTutor } from "./tutor.js";

// lesson topic -> drill id in data/drills.json (or generated drills)
const TOPIC_DRILL = {
  "Relativsätze": "relativsaetze",
  "Konjunktiv": "konjunktiv2",
  "Präpositionen": "praep-dat-akk",
  "Satzbau & Konnektoren": "konnektoren",
  "Verben & Zeiten": "praeteritum",
  "Fälle": "wechselpraep",
  "Nomen & Artikel": "artikel",
};

const LEVEL_GROUPS = [
  { levels: ["B1"], label: "B1 — Prüfungsstoff", open: true },
  { levels: ["A1", "A2"], label: "A1/A2 — Wiederholung", open: false },
  { levels: ["B2"], label: "B2 — nach der Prüfung", open: false },
];

export async function getLessons() {
  try {
    const l = await loadData("lessons");
    return Array.isArray(l) ? l.filter((x) => !x.skip) : [];
  } catch {
    return [];
  }
}

// minimal markdown: escape, then **bold** and newlines
function md(s) {
  return esc(s || "")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");
}

export function renderLernenSection(view, lessons, openLesson) {
  state.lessonsRead = state.lessonsRead || {};
  const readCount = lessons.filter((l) => state.lessonsRead[l.id]).length;

  view.append(h("h2", { class: "section" }, "Grammatik-Bibliothek (aus deinen Playlists)"));
  view.append(h("div", { class: "card", style: "padding-top:10px" },
    h("div", { class: "muted small", style: "margin-bottom:4px" },
      `${readCount} von ${lessons.length} Lektionen gelesen`),
    h("div", { class: "progress blue" },
      h("div", { style: `width:${lessons.length ? (100 * readCount) / lessons.length : 0}%` }))));

  for (const grp of LEVEL_GROUPS) {
    const items = lessons.filter((l) => grp.levels.includes(l.level));
    if (!items.length) continue;
    const gDone = items.filter((l) => state.lessonsRead[l.id]).length;
    const det = h("details", { class: "week", ...(grp.open ? { open: true } : {}) },
      h("summary", {}, grp.label, " ", h("span", { class: "muted" }, `· ${gDone}/${items.length}`)));

    // group by topic within level
    const topics = [...new Set(items.map((l) => l.topic))];
    for (const t of topics) {
      det.append(h("div", { class: "muted small", style: "margin:8px 0 2px;font-weight:700" }, t));
      for (const l of items.filter((x) => x.topic === t)) {
        const done = !!state.lessonsRead[l.id];
        det.append(h("div", { class: "check" + (done ? " done" : ""), onclick: () => openLesson(l) },
          h("span", { class: "box" }, "✓"),
          h("span", { class: "lbl grow" }, l.title),
          h("span", { class: "muted small" }, `${l.readMinutes || 2} Min`)));
      }
    }
    view.append(det);
  }
}

export function renderLesson(view, lesson, goBack, startDrill) {
  view.innerHTML = "";
  view.scrollTop = 0;
  state.lessonsRead = state.lessonsRead || {};

  view.append(h("button", { class: "back-link", onclick: goBack }, "‹ Üben"));
  view.append(
    h("div", { class: "reader-title" }, lesson.title),
    h("div", { class: "muted small" },
      h("span", { class: "lvl " + (lesson.level === "B2" ? "B2" : lesson.level === "B1" ? "B1" : "A2") }, lesson.level),
      ` · ${lesson.topic} · ${lesson.readMinutes || 2} Min Lesezeit`)
  );

  view.append(h("div", { class: "card" }, h("div", { html: md(lesson.rule) })));

  if (lesson.table && lesson.table.length > 1) {
    const [head, ...rows] = lesson.table;
    const tbl = h("table", { style: "width:100%;border-collapse:collapse;font-size:.9rem" });
    tbl.append(h("tr", {}, ...head.map((c) => h("th", { style: "text-align:left;padding:6px;border-bottom:2px solid var(--line)" }, c))));
    for (const r of rows)
      tbl.append(h("tr", {}, ...r.map((c) => h("td", { style: "padding:6px;border-bottom:1px solid var(--line)" }, c))));
    view.append(h("div", { class: "card", style: "overflow-x:auto" }, tbl));
  }

  if (lesson.examples?.length) {
    const ex = h("div", { class: "card" }, h("h3", {}, "Beispiele"));
    for (const e of lesson.examples) {
      ex.append(h("div", { style: "padding:7px 0;border-bottom:1px solid var(--line)" },
        h("div", {}, h("b", {}, e.de)),
        h("div", { class: "muted small" }, e.en, e.note ? ` — ${e.note}` : "")));
    }
    view.append(ex);
  }

  if (lesson.mistakes?.length) {
    const mi = h("div", { class: "card" }, h("h3", {}, "Typische Fehler"));
    for (const m of lesson.mistakes) mi.append(h("div", { class: "small", style: "padding:4px 0" }, m));
    view.append(mi);
  }

  view.append(h("button", {
    class: "btn blue", style: "width:100%;margin-top:4px",
    onclick: () => openTutor({
      key: "lesson-" + lesson.id,
      title: lesson.title,
      context: `Grammar lesson "${lesson.title}" (${lesson.level}, topic: ${lesson.topic}).\nRule:\n${lesson.rule}\nExamples:\n${(lesson.examples || []).map((e) => e.de).join("\n")}`,
      chips: [
        { label: "Einfacher erklären", prompt: "Explain this rule more simply, as if I keep getting it wrong." },
        { label: "Mehr Beispiele", prompt: "Give me 4 new B1-level example sentences for this rule with English translations." },
        { label: "Teste mich", prompt: "Give me one fill-in-the-gap question on this rule. Wait for my answer, then correct me." },
      ],
    }),
  }, "💬 Lehrer fragen"));

  const drillId = TOPIC_DRILL[lesson.topic];
  const done = !!state.lessonsRead[lesson.id];
  const row = h("div", { class: "row", style: "margin:12px 0" },
    h("button", {
      class: "btn grow " + (done ? "ghost" : "green"),
      onclick: () => {
        if (done) delete state.lessonsRead[lesson.id];
        else { state.lessonsRead[lesson.id] = today(); bumpActivity("lessons"); toast("Lektion abgehakt ✓"); }
        save(); renderLesson(view, lesson, goBack, startDrill);
      },
    }, done ? "Gelesen ✓ — Markierung entfernen" : "✓ Als gelesen markieren"));
  if (drillId && startDrill)
    row.append(h("button", { class: "btn blue", onclick: () => startDrill(drillId) }, "Üben →"));
  view.append(row);

  // video fallback, collapsed by design: text first, video only if needed
  if (lesson.video?.url) {
    const det = h("details", { class: "week" },
      h("summary", {}, "🎥 Nicht verstanden? Video ansehen"));
    const secs = (t) => { const [m, s] = t.split(":").map(Number); return m * 60 + (s || 0); };
    for (const c of lesson.video.chapters || []) {
      det.append(h("div", { style: "padding:5px 0" },
        h("a", { href: `${lesson.video.url}?t=${secs(c.t)}s`, target: "_blank", style: "color:var(--blue)" },
          `${c.t} — ${c.label}`)));
    }
    if (!lesson.video.chapters?.length)
      det.append(h("a", { href: lesson.video.url, target: "_blank", style: "color:var(--blue)" }, "Zum Video"));
    view.append(det);
  }
}
