// App shell: routing, HUD (level / daily XP ring / streak), celebrations,
// Plan (Heute checklist + 12-week plan + settings).

import { state, save, h, loadData, daysToExam, streak, today, toast, pct, dailyGoal, openSheet } from "./core.js";
import { levelInfo, applyFreezes } from "./game.js";
import { renderLibrary, renderReader, stopReaderAudio } from "./reader.js";
import { renderVocab, dueCards, b1Coverage } from "./vocab.js";
import { renderPractice } from "./practice.js";
import { renderFeed } from "./feed.js";
import { openBlitzPicker } from "./blitz.js";
import { celebrate } from "./fx.js";
import { stopTTS } from "./tts.js";

const view = document.getElementById("view");
const tabs = document.querySelectorAll(".tab");

const routes = {
  today: renderFeed,
  library: renderLibrary,
  vocab: renderVocab,
  practice: renderPractice,
  plan: renderPlan,
};

let activeTab = "today";
function go(tab) {
  activeTab = tab;
  stopReaderAudio();
  stopTTS();
  view.className = "view";
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  view.scrollTop = 0;
  routes[tab](view);
  updateHud();
}
tabs.forEach((t) => t.addEventListener("click", () => go(t.dataset.tab)));

// ---- HUD: level · daily ring · streak · countdown -------------------------

function ring(frac, size = 30) {
  const r = size / 2 - 3, c = 2 * Math.PI * r;
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="4"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${frac >= 1 ? "var(--green)" : "var(--accent)"}"
      stroke-width="4" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, frac))}"
      transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset .6s"/></svg>`;
  return h("span", { class: "ring", html: svg });
}

function updateHud() {
  const hud = document.getElementById("hud");
  const lv = levelInfo(state.game.xp);
  const xpToday = state.game.daily[today()] || 0;
  hud.innerHTML = "";
  hud.append(
    h("span", { class: "hud-lv" }, `Lv ${lv.level}`),
    h("span", { class: "hud-xp" }, ring(xpToday / dailyGoal()), h("span", {}, `${xpToday}/${dailyGoal()}`)),
    h("span", { class: "hud-streak" + (state.activity[today()] ? " lit" : "") }, `🔥 ${streak()}`));
  const d = daysToExam();
  document.getElementById("countdown").textContent = d > 0 ? `🎯 ${d} T` : "🎯 Heute!";
}

function openStats() {
  const lv = levelInfo(state.game.xp);
  const xpToday = state.game.daily[today()] || 0;
  const best = state.game.best;
  openSheet(h("div", {},
    h("div", { class: "row" },
      h("div", { class: "grow" },
        h("div", { class: "word" }, `Level ${lv.level} · ${lv.title}`),
        h("div", { class: "muted small" }, `${state.game.xp} XP gesamt · noch ${lv.span - lv.into} XP bis Level ${lv.level + 1}`)),
      ring(xpToday / dailyGoal(), 56)),
    h("div", { class: "progress accent", style: "margin:10px 0" }, h("div", { style: `width:${pct(lv.into, lv.span)}%` })),
    h("div", { class: "tiles" },
      tile(`${xpToday}/${dailyGoal()}`, "XP heute (Tagesziel)"),
      tile(`🔥 ${streak()}`, "Tage in Folge"),
      tile(`🧊 ${state.game.freezes}`, "Streak-Freezes (alle 7 Tage +1)"),
      tile(`${state.game.bestCombo}`, "Beste Combo"),
      tile(`${best.artikel || 0} / ${best.perfekt || 0} / ${best.wort || 0}`, "Blitz-Rekorde (Art./Perf./Wort)"),
      tile(`${daysToExam()}`, "Tage bis zur Prüfung")),
    h("div", { class: "muted small", style: "margin-top:10px" }, weekStrip())));
}

// last 7 days as a mini bar strip of XP
function weekStrip() {
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const max = Math.max(dailyGoal(), ...days.map((d) => state.game.daily[d] || 0));
  return h("div", { class: "week-strip" }, ...days.map((d) => {
    const x = state.game.daily[d] || 0;
    return h("div", { class: "ws-col" },
      h("div", { class: "ws-bar" + (x >= dailyGoal() ? " hit" : "") + (state.game.frozen[d] ? " frozen" : ""),
        style: `height:${Math.max(4, (60 * x) / max)}px` }),
      h("div", {}, new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short" }).slice(0, 2)));
  }));
}

document.getElementById("hud").addEventListener("click", openStats);

window.addEventListener("dk-xp", (e) => {
  const r = e.detail;
  updateHud();
  if (r.goalReached) {
    setTimeout(() => celebrate("🎯", "Tagesziel geschafft!", `${dailyGoal()} XP heute — dein Streak ist sicher. 🔥 ${streak()}`), 400);
    if (r.freezeEarned) setTimeout(() => toast("🧊 Streak-Freeze verdient!"), 3000);
  } else if (r.leveledUp) {
    const lv = levelInfo(state.game.xp);
    setTimeout(() => celebrate("⬆️", `Level ${lv.level}!`, `Du bist jetzt: ${lv.title}`), 400);
  }
});

// cross-module navigation (feed nudges)
window.addEventListener("dk-go", async (e) => {
  const { tab, nextEssay } = e.detail;
  if (tab === "blitz") return openBlitzPicker(view, () => go("today"));
  go(tab);
  if (nextEssay) {
    const essays = await loadData("essays");
    const next = essays.find((x) => x.level === "B1" && !state.essaysRead[x.id]) || essays.find((x) => !state.essaysRead[x.id]);
    if (next) renderReader(view, next);
  }
});

// ---- Heute (checklist + stats, shown at the top of Plan) ---------------

async function renderToday(v) {
  const essays = await loadData("essays");
  const cov = await b1Coverage();
  const read = Object.keys(state.essaysRead).length;
  const due = dueCards().length;
  const act = state.activity[today()] || {};

  v.append(
    h("h2", { class: "section" }, "Heute"),
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
    { lbl: `Tagesziel: ${state.game.daily[today()] || 0}/${dailyGoal()} XP`, done: (state.game.daily[today()] || 0) >= dailyGoal(), tab: "today" },
    { lbl: "Eine Übungsrunde (Pfad/Grammatik/Lesen)", done: (act.drills || 0) > 0 || (act.lesen || 0) > 0 || (act.path || 0) > 0, tab: "practice" },
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
            renderReader(view, next);
          },
        }, "Lesen"))));
  }
}

const tile = (big, lbl) => h("div", { class: "tile" }, h("div", { class: "big" }, big), h("div", { class: "lbl" }, lbl));

// ---- Plan (12 weeks) + settings --------------------------------------

async function renderPlan(v) {
  v.innerHTML = "";
  await renderToday(v);
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
    state.settings.examDate = dateIn.value; save(); updateHud(); toast("Prüfungsdatum gespeichert");
  });
  s.append(h("label", { class: "small" }, "Prüfungsdatum (Goethe B1):"), dateIn);

  // gamification settings
  const goalSel = h("select", { style: "margin-top:4px" },
    ...[[50, "Locker · 50 XP (~5 Min)"], [100, "Normal · 100 XP (~10 Min)"], [200, "Ehrgeizig · 200 XP (~20 Min)"]]
      .map(([n, l]) => h("option", { value: n, ...(dailyGoal() === n ? { selected: true } : {}) }, l)));
  goalSel.addEventListener("change", () => {
    state.settings.dailyGoal = Number(goalSel.value); save(); updateHud(); toast("Tagesziel gespeichert");
  });
  s.append(h("label", { class: "small", style: "display:block;margin-top:10px" }, "Tagesziel:"), goalSel);
  const soundCb = h("input", { type: "checkbox", style: "width:20px;height:20px;accent-color:var(--accent)",
    ...(state.settings.sound !== false ? { checked: true } : {}) });
  soundCb.addEventListener("change", () => { state.settings.sound = soundCb.checked; save(); });
  s.append(h("label", { class: "row small", style: "margin-top:10px;cursor:pointer" }, soundCb, "Töne bei richtig/falsch (Vibration bleibt an)"));

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

// spend streak freezes on missed days before anything reads the streak
const frozeDays = applyFreezes(state.game, state.activity, today());
if (frozeDays) { save(); setTimeout(() => toast(`🧊 Streak-Freeze eingesetzt — dein 🔥 ${streak()}er-Streak lebt!`), 800); }

go("today");

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
