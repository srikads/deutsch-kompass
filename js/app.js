// App shell: routing, Heute dashboard, Plan (12-week checklist) + settings.

import { state, save, h, loadData, daysToExam, streak, today, toast, pct } from "./core.js";
import { renderLibrary } from "./reader.js";
import { renderVocab, dueCards, b1Coverage } from "./vocab.js";
import { renderPractice } from "./practice.js";
import { stopTTS } from "./tts.js";

const view = document.getElementById("view");
const tabs = document.querySelectorAll(".tab");

const routes = {
  today: renderToday,
  library: renderLibrary,
  vocab: renderVocab,
  practice: renderPractice,
  plan: renderPlan,
};

let activeTab = "today";
function go(tab) {
  activeTab = tab;
  stopTTS();
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  view.scrollTop = 0;
  routes[tab](view);
  updateCountdown();
}
tabs.forEach((t) => t.addEventListener("click", () => go(t.dataset.tab)));

function updateCountdown() {
  const d = daysToExam();
  document.getElementById("countdown").textContent =
    d > 0 ? `🎯 B1 in ${d} Tagen` : "🎯 Prüfungstag!";
}

// ---- Heute ------------------------------------------------------------

async function renderToday(v) {
  v.innerHTML = "";
  const essays = await loadData("essays");
  const cov = await b1Coverage();
  const read = Object.keys(state.essaysRead).length;
  const due = dueCards().length;
  const act = state.activity[today()] || {};

  v.append(
    h("div", { class: "card", style: "display:flex;justify-content:space-between;align-items:center" },
      h("div", {},
        h("div", { class: "streak" }, "🔥 ", h("b", {}, String(streak())), " Tage in Folge"),
        h("div", { class: "muted small" }, new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }))),
      h("div", { style: "text-align:right" },
        h("div", { class: "big-num", style: "color:var(--accent)" }, String(daysToExam())),
        h("div", { class: "muted small" }, "Tage bis zur Prüfung")))
  );

  // auto-checked daily checklist
  const items = [
    { lbl: `Essay lesen (${act.essays || 0}/${state.settings.dailyEssays})`, done: (act.essays || 0) >= state.settings.dailyEssays, tab: "library" },
    { lbl: due ? `Vokabeln wiederholen (${due} fällig)` : "Vokabeln wiederholen (nichts fällig ✓)", done: (act.reviews || 0) > 0 || due === 0, tab: "vocab" },
    { lbl: "Eine Übungsrunde (Grammatik/Lesen)", done: (act.drills || 0) > 0 || (act.lesen || 0) > 0, tab: "practice" },
    { lbl: "Neue Wörter sammeln (beim Lesen antippen)", done: (act.newCards || 0) > 0, tab: "library" },
  ];
  const cl = h("div", { class: "card" }, h("h3", {}, "Heutige Checkliste"),
    h("div", { class: "muted small", style: "margin-bottom:4px" }, "hakt sich automatisch ab, wenn du die Aufgabe machst"));
  for (const it of items) {
    cl.append(h("div", { class: "check auto" + (it.done ? " done" : ""), onclick: () => go(it.tab) },
      h("span", { class: "box" }, "✓"), h("span", { class: "lbl grow" }, it.lbl)));
  }
  v.append(cl);

  v.append(h("div", { class: "tiles" },
    tile(read + "/" + essays.length, "Essays gelesen"),
    tile(pct(cov.mastered, cov.total) + "%", "B1-Wortliste gemeistert"),
    tile(String(Object.keys(state.cards).length), "Lernkarten"),
    tile(String(due), "Karten fällig")));

  // continue reading: first unread B1 essay
  const next = essays.find((e) => e.level === "B1" && !state.essaysRead[e.id]) || essays.find((e) => !state.essaysRead[e.id]);
  if (next) {
    v.append(h("div", { class: "card" },
      h("h3", {}, "Weiterlesen"),
      h("div", { class: "row" },
        h("div", { class: "grow" },
          h("b", {}, next.title),
          h("div", { class: "muted small" }, `${next.level} · ${next.topic} · ${Math.max(1, Math.round(next.words / 140))} Min`)),
        h("button", {
          class: "btn sm", onclick: async () => {
            go("library");
            const { renderReader } = await import("./reader.js");
            renderReader(view, next);
          },
        }, "Lesen"))));
  }
}

const tile = (big, lbl) => h("div", { class: "tile" }, h("div", { class: "big" }, big), h("div", { class: "lbl" }, lbl));

// ---- Plan (12 weeks) + settings --------------------------------------

async function renderPlan(v) {
  v.innerHTML = "";
  const plan = await loadData("plan");
  if (!state.settings.planStart) {
    state.settings.planStart = today();
    save();
  }
  const start = new Date(state.settings.planStart);
  const curWeek = Math.min(plan.length - 1, Math.floor((new Date(today()) - start) / (7 * 86400000)));

  const totalTasks = plan.reduce((s, w) => s + w.tasks.length, 0);
  const doneTasks = Object.keys(state.planDone).length;
  v.append(h("div", { class: "card" },
    h("div", { class: "row" },
      h("div", { class: "grow" }, h("h3", {}, "Lernplan bis zur Prüfung"),
        h("div", { class: "muted small" }, `${doneTasks} von ${totalTasks} Aufgaben erledigt`)),
      h("div", { class: "big-num" }, pct(doneTasks, totalTasks) + "%")),
    h("div", { class: "progress accent", style: "margin-top:8px" }, h("div", { style: `width:${pct(doneTasks, totalTasks)}%` }))));

  plan.forEach((week, wi) => {
    const from = new Date(start); from.setDate(from.getDate() + wi * 7);
    const to = new Date(from); to.setDate(to.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
    const wDone = week.tasks.filter((_, ti) => state.planDone[`w${wi}-t${ti}`]).length;
    const det = h("details", { class: "week", ...(wi === curWeek ? { open: true } : {}) },
      h("summary", {}, `Woche ${wi + 1}: ${week.focus} `,
        h("span", { class: "muted" }, `· ${fmt(from)}–${fmt(to)} · ${wDone}/${week.tasks.length}`)));
    week.tasks.forEach((task, ti) => {
      const id = `w${wi}-t${ti}`;
      const done = !!state.planDone[id];
      det.append(h("div", {
        class: "check" + (done ? " done" : ""),
        onclick: () => {
          if (state.planDone[id]) delete state.planDone[id];
          else state.planDone[id] = today();
          save(); renderPlan(v);
        },
      }, h("span", { class: "box" }, "✓"), h("span", { class: "lbl grow" }, task)));
    });
    v.append(det);
  });

  // settings
  const s = h("div", { class: "card" }, h("h3", {}, "Einstellungen"));
  const dateIn = h("input", { type: "date", value: state.settings.examDate });
  dateIn.addEventListener("change", () => {
    state.settings.examDate = dateIn.value; save(); updateCountdown(); toast("Prüfungsdatum gespeichert");
  });
  s.append(h("label", { class: "small" }, "Prüfungsdatum (Goethe B1):"), dateIn);

  const tutorIn = h("input", {
    type: "text", placeholder: "https://….workers.dev",
    value: state.settings.tutorUrl || "", style: "margin-top:10px",
  });
  tutorIn.addEventListener("change", () => {
    state.settings.tutorUrl = tutorIn.value.trim(); save();
    toast(state.settings.tutorUrl ? "Lehrer-URL gespeichert" : "Lehrer-URL entfernt");
  });
  s.append(h("label", { class: "small", style: "display:block;margin-top:10px" },
    "Lehrer-URL (Cloudflare Worker — Anleitung: docs/TUTOR_SETUP.md):"), tutorIn);

  const exp = h("button", {
    class: "btn ghost sm", style: "margin-top:10px",
    onclick: () => {
      const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
      const a = h("a", { href: URL.createObjectURL(blob), download: `deutsch-kompass-backup-${today()}.json` });
      a.click();
    },
  }, "Daten exportieren");
  const impInput = h("input", { type: "file", accept: ".json", style: "display:none" });
  impInput.addEventListener("change", async () => {
    try {
      const data = JSON.parse(await impInput.files[0].text());
      Object.assign(state, data); save(); toast("Import erfolgreich"); go("plan");
    } catch { toast("Import fehlgeschlagen"); }
  });
  const imp = h("button", { class: "btn ghost sm", style: "margin-top:10px;margin-left:8px", onclick: () => impInput.click() }, "Daten importieren");
  s.append(h("div", {}, exp, imp, impInput));
  s.append(h("div", { class: "muted small", style: "margin-top:10px" },
    "Neue Essays laden: am PC  `node scripts/fetch_content.mjs`  ausführen."));
  v.append(s);
}

// ---- boot -------------------------------------------------------------

updateCountdown();
go("today");

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
