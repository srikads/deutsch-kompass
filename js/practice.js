// Üben: grammar drills (partly generated from the real B1 wordlist),
// Goethe-style Lesen practice sets, and Schreiben prompts with self-check.

import { state, save, h, loadData, toast, bumpActivity, today, shuffle, pct } from "./core.js";
import { getLessons, renderLernenSection, renderLesson } from "./lernen.js";
import { openTutor } from "./tutor.js";

async function startDrillById(view, id) {
  if (id === "artikel") return articleDrill(view);
  if (id === "perfekt") return perfektDrill(view);
  const drills = await loadData("drills");
  const d = drills.find((x) => x.id === id);
  if (d) runQuiz(view, d.title, shuffle(d.questions).slice(0, 10), d.id);
}

export async function renderPractice(view) {
  view.innerHTML = "";
  const [drills, lesen, schreiben, lessons] = await Promise.all([
    loadData("drills"), loadData("lesen_sets"), loadData("schreiben"), getLessons(),
  ]);

  if (lessons.length) {
    renderLernenSection(view, lessons, (l) =>
      renderLesson(view, l, () => renderPractice(view), (drillId) => startDrillById(view, drillId)));
  }

  // --- Grammatik ------------------------------------------------------
  view.append(h("h2", { class: "section" }, "Grammatik-Drills"));
  const g = h("div", { class: "card" });
  const drillBtn = (title, sub, fn, id) => {
    const s = state.drillStats[id];
    return h("div", { class: "row", style: "padding:8px 0;border-bottom:1px solid var(--line)" },
      h("div", { class: "grow" }, h("b", {}, title), h("div", { class: "muted small" },
        sub + (s ? ` · bisher ${s.right}✓ ${s.wrong}✗` : "")),
      ),
      h("button", { class: "btn sm", onclick: fn }, "Start"));
  };
  g.append(
    drillBtn("der / die / das", "Artikel echter B1-Nomen", () => articleDrill(view), "artikel"),
    drillBtn("Perfekt", "hat oder ist? Partizip II echter B1-Verben", () => perfektDrill(view), "perfekt"),
    ...drills.map((d) =>
      drillBtn(d.title, d.subtitle, () => runQuiz(view, d.title, shuffle(d.questions).slice(0, 10), d.id), d.id))
  );
  view.append(g);

  // --- Lesen ----------------------------------------------------------
  view.append(h("h2", { class: "section" }, "Lesen-Training (Prüfungsformat)"));
  const l = h("div", { class: "card" });
  for (const set of lesen) {
    const done = state.lesenDone[set.id];
    l.append(h("div", { class: "row", style: "padding:8px 0;border-bottom:1px solid var(--line)" },
      h("span", { class: "readmark" + (done ? "" : ""), style: done ? "background:var(--green);border-color:var(--green);color:#fff;min-width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:.7rem" : "" }, done ? "✓" : ""),
      h("div", { class: "grow" }, h("b", {}, set.title),
        h("div", { class: "muted small" }, set.teil + (done ? ` · Ergebnis: ${done.score}/${done.total}` : ""))),
      h("button", { class: "btn sm blue", onclick: () => runLesen(view, set) }, done ? "Nochmal" : "Start")));
  }
  view.append(l);

  // --- Schreiben ------------------------------------------------------
  view.append(h("h2", { class: "section" }, "Schreiben-Training"));
  const s = h("div", { class: "card" });
  for (const p of schreiben) {
    const done = state.schreibenDone[p.id];
    s.append(h("div", { class: "row", style: "padding:8px 0;border-bottom:1px solid var(--line)" },
      h("span", { style: `min-width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:.7rem;border:2px solid var(--line);${done ? "background:var(--green);border-color:var(--green);color:#fff" : "color:transparent"}` }, "✓"),
      h("div", { class: "grow" }, h("b", {}, p.title), h("div", { class: "muted small" }, p.teil)),
      h("button", { class: "btn sm", onclick: () => runSchreiben(view, p) }, done ? "Ansehen" : "Start")));
  }
  view.append(s);
}

// ---- generic quiz engine ---------------------------------------------

function runQuiz(view, title, questions, statId, opts = {}) {
  let i = 0, score = 0;
  view.innerHTML = "";
  view.append(h("button", { class: "back-link", onclick: () => renderPractice(view) }, "‹ Üben"));
  if (opts.text) {
    const d = h("details", { class: "week", open: true },
      h("summary", {}, "Lesetext"),
      h("div", { class: "small", style: "white-space:pre-wrap;padding-bottom:10px" }, opts.text));
    view.append(d);
  }
  const box = h("div");
  view.append(box);

  const ask = () => {
    if (i >= questions.length) {
      const st = (state.drillStats[statId] = state.drillStats[statId] || { right: 0, wrong: 0 });
      st.right += score; st.wrong += questions.length - score;
      bumpActivity("drills");
      if (opts.onDone) opts.onDone(score, questions.length);
      save();
      box.innerHTML = "";
      box.append(h("div", { class: "card", style: "text-align:center" },
        h("div", { class: "big-num" }, `${score} / ${questions.length}`),
        h("div", { class: "muted" }, title),
        h("button", { class: "btn green", style: "margin-top:12px", onclick: () => renderPractice(view) }, "Fertig")));
      return;
    }
    const q = questions[i];
    box.innerHTML = "";
    box.append(
      h("div", { class: "muted small" }, `${title} · ${i + 1} / ${questions.length}`),
      h("div", { class: "card" },
        h("h2", { html: q.q }),
        ...q.opts.map((o, oi) =>
          h("button", {
            class: "opt",
            onclick: (e) => {
              const right = oi === q.a;
              if (right) score++;
              e.target.classList.add(right ? "correct" : "wrong");
              [...box.querySelectorAll(".opt")].forEach((b, bi) => {
                b.disabled = true;
                if (bi === q.a) b.classList.add("correct");
              });
              if (q.why) box.querySelector(".card").append(h("div", { class: "muted small", style: "margin-top:8px" }, "ℹ️ " + q.why));
              setTimeout(() => { i++; ask(); }, right ? 700 : 2200);
            },
          }, o))));
  };
  ask();
}

// ---- drills generated from the real Goethe wordlist ------------------

async function articleDrill(view) {
  const list = (await loadData("b1_wordlist")).filter((e) => e.pos === "noun" && /^(der|die|das)$/.test(e.article));
  const qs = shuffle(list).slice(0, 12).map((e) => {
    const arts = ["der", "die", "das"];
    return { q: `___ <b>${e.lemma}</b>`, opts: arts, a: arts.indexOf(e.article), why: e.display };
  });
  runQuiz(view, "der/die/das", qs, "artikel");
}

async function perfektDrill(view) {
  const verbs = (await loadData("b1_wordlist")).filter((e) => e.pos === "verb" && /\b(hat|ist) ge?\S+/.test(e.forms || ""));
  const pick = shuffle(verbs).slice(0, 10);
  const qs = pick.map((e) => {
    const m = e.forms.match(/\b(hat|ist) (\S+)\s*$/);
    if (!m) return null;
    const correct = `${m[1]} ${m[2]}`;
    const swapped = `${m[1] === "hat" ? "ist" : "hat"} ${m[2]}`;
    const other = shuffle(verbs.filter((v) => v !== e))[0];
    const om = other.forms.match(/\b(hat|ist) (\S+)\s*$/);
    const opts = shuffle([correct, swapped, om ? `${m[1]} ${om[2]}` : correct + "e"]);
    return { q: `Perfekt von <b>${e.lemma}</b>?`, opts, a: opts.indexOf(correct), why: e.lemma + ", " + e.forms };
  }).filter(Boolean);
  runQuiz(view, "Perfekt", qs, "perfekt");
}

// ---- Lesen sets -------------------------------------------------------

function runLesen(view, set) {
  runQuiz(view, set.title, set.questions, "lesen-" + set.id, {
    text: set.text,
    onDone: (score, total) => {
      state.lesenDone[set.id] = { score, total, date: today() };
      bumpActivity("lesen");
      save();
    },
  });
}

// ---- Schreiben --------------------------------------------------------

function runSchreiben(view, p) {
  view.innerHTML = "";
  view.append(h("button", { class: "back-link", onclick: () => renderPractice(view) }, "‹ Üben"));
  state.schreibenDrafts = state.schreibenDrafts || {};

  const count = h("span", { class: "muted small" });
  const ta = h("textarea", { class: "schreiben", placeholder: "Schreib deinen Text hier…" });
  ta.value = state.schreibenDrafts[p.id] || "";
  const updateCount = () => {
    const n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
    count.textContent = `${n} Wörter (Ziel: ca. ${p.minWords})`;
  };
  ta.addEventListener("input", () => {
    state.schreibenDrafts[p.id] = ta.value; save(); updateCount();
  });
  updateCount();

  const checkBoxes = p.points.map((pt) =>
    h("label", { class: "check", style: "cursor:pointer" },
      h("input", { type: "checkbox", style: "width:20px;height:20px;accent-color:var(--green)" }),
      h("span", { class: "lbl grow" }, pt)));

  const done = !!state.schreibenDone[p.id];
  view.append(
    h("div", { class: "card" },
      h("h2", {}, p.title), h("div", { class: "muted small" }, p.teil),
      h("div", { style: "margin:10px 0;white-space:pre-wrap" }, p.task)),
    h("div", { class: "card" },
      h("h3", {}, "Redemittel"),
      h("div", { class: "small" }, p.redemittel.join(" · "))),
    ta, count,
    h("button", {
      class: "btn blue", style: "width:100%;margin:10px 0 0",
      onclick: () => {
        if (!ta.value.trim()) return toast("Schreib zuerst deinen Text");
        openTutor({
          key: "schreiben-" + p.id + "-" + Date.now().toString(36).slice(0, 6),
          title: p.title,
          context: `Goethe B1 Schreiben task (${p.teil}):\n${p.task}\n\nThe student's draft:\n${ta.value.trim()}`,
          chips: [
            { label: "Text korrigieren", prompt: "Correct my draft: list my mistakes as ✗ wrong → ✓ right with short reasons, then a 1-2 sentence verdict. Don't rewrite the whole text." },
            { label: "Habe ich alle Punkte?", prompt: "Check against the task: did I cover all required content points and the right register (du/Sie)?" },
            { label: "Bessere Redemittel", prompt: "Suggest 3 B1-level phrases that would improve my text, tied to what I wrote." },
          ],
        });
      },
    }, "💬 Text vom Lehrer prüfen lassen"),
    h("div", { class: "card" },
      h("h3", {}, "Selbst-Check (wie in der Prüfung bewertet)"),
      ...checkBoxes),
    h("button", {
      class: "btn " + (done ? "ghost" : "green"), style: "width:100%;margin:10px 0",
      onclick: () => {
        if (done) delete state.schreibenDone[p.id];
        else { state.schreibenDone[p.id] = today(); bumpActivity("schreiben"); toast("Schreibaufgabe abgehakt ✓"); }
        save(); renderPractice(view);
      },
    }, done ? "Erledigt ✓ — Markierung entfernen" : "Als erledigt markieren")
  );
}
