// Flashcards with spaced repetition (SM-2 lite), a multiple-choice quiz,
// and the Goethe B1 wordlist coverage browser ("checklist" style).

import { state, save, h, today, toast, bumpActivity, loadData, wlKey, pct, shuffle } from "./core.js";

// ---- card model -------------------------------------------------------

export function addCard(front, extra = {}) {
  if (state.cards[front]) { toast("Karte existiert schon"); return; }
  state.cards[front] = {
    front, back: extra.back || "", grammar: extra.grammar || "",
    verbForms: extra.verbForms || "", b1: !!extra.b1, source: extra.source || "",
    added: today(), due: today(), interval: 0, ease: 2.3, reps: 0, lapses: 0,
  };
  bumpActivity("newCards");
  save();
}

function grade(card, g) {
  // g: 0 nochmal, 1 schwer, 2 gut, 3 leicht
  if (g === 0) {
    card.lapses++; card.reps = 0; card.interval = 0;
    card.ease = Math.max(1.3, card.ease - 0.2);
  } else {
    card.reps++;
    if (g === 1) { card.ease = Math.max(1.3, card.ease - 0.15); card.interval = Math.max(1, Math.round(card.interval * 1.2)); }
    if (g === 2) card.interval = card.interval === 0 ? 1 : Math.round(card.interval * card.ease);
    if (g === 3) { card.ease += 0.05; card.interval = card.interval === 0 ? 2 : Math.round(card.interval * card.ease * 1.4); }
  }
  const d = new Date();
  d.setDate(d.getDate() + card.interval);
  card.due = d.toISOString().slice(0, 10);
  save();
}

export function dueCards() {
  const t = today();
  return Object.values(state.cards).filter((c) => c.due <= t);
}

// mastered = self-marked known OR card successfully repeated twice
export async function b1Coverage() {
  const list = await loadData("b1_wordlist");
  let mastered = 0;
  const cardLemmas = new Map(Object.values(state.cards).map((c) => [c.front.toLowerCase(), c]));
  for (const e of list) {
    if (state.wordKnown[wlKey(e)]) { mastered++; continue; }
    const c = cardLemmas.get(e.lemma.toLowerCase());
    if (c && c.reps >= 2) mastered++;
  }
  return { mastered, total: list.length };
}

// ---- main view --------------------------------------------------------

export async function renderVocab(view) {
  view.innerHTML = "";
  const due = dueCards();
  const total = Object.keys(state.cards).length;
  const cov = await b1Coverage();

  view.append(
    h("div", { class: "tiles" },
      h("div", { class: "tile" }, h("div", { class: "big" }, String(due.length)), h("div", { class: "lbl" }, "Karten fällig")),
      h("div", { class: "tile" }, h("div", { class: "big" }, String(total)), h("div", { class: "lbl" }, "Karten gesamt")),
      h("div", { class: "tile", style: "grid-column:1/-1" },
        h("div", { class: "row" },
          h("div", { class: "grow" },
            h("div", { class: "big" }, pct(cov.mastered, cov.total) + "%"),
            h("div", { class: "lbl" }, `Goethe-B1-Wortliste: ${cov.mastered} / ${cov.total} gemeistert`)),
        ),
        h("div", { class: "progress", style: "margin-top:8px" },
          h("div", { style: `width:${pct(cov.mastered, cov.total)}%` }))))
  );

  view.append(
    h("div", { class: "row", style: "margin:12px 0" },
      h("button", { class: "btn grow", disabled: !due.length, onclick: () => renderReview(view) },
        `Wiederholen (${due.length})`),
      h("button", { class: "btn blue grow", disabled: total < 4, onclick: () => renderMcQuiz(view) },
        "Quiz"))
  );

  // deck list
  const deck = h("div", { class: "card" }, h("h3", {}, "Meine Karten"));
  const cards = Object.values(state.cards).sort((a, b) => b.added.localeCompare(a.added));
  if (!cards.length) deck.append(h("div", { class: "muted" }, "Noch keine Karten. Tippe beim Lesen auf Wörter, um sie zu speichern."));
  for (const c of cards.slice(0, 50)) {
    deck.append(
      h("div", { class: "row", style: "padding:6px 0;border-bottom:1px solid var(--line)" },
        h("div", { class: "grow" },
          h("b", {}, c.front), c.b1 ? h("span", { class: "tag", style: "margin-left:6px;font-size:.6rem" }, "B1") : null,
          h("div", { class: "muted small" }, c.back || c.grammar || "")),
        h("span", { class: "muted small" }, c.due <= today() ? "fällig" : "→ " + c.due),
        h("button", { class: "btn ghost sm", onclick: (e) => { delete state.cards[c.front]; save(); renderVocab(view); } }, "✕"))
    );
  }
  deck.append(h("div", { class: "muted small", style: "margin-top:6px" },
    cards.length > 50 ? `… und ${cards.length - 50} weitere` : ""));
  view.append(deck);

  await renderWordlistBrowser(view);
}

// ---- SRS review -------------------------------------------------------

function renderReview(view) {
  const queue = shuffle(dueCards()).slice(0, state.settings.dailyReviews);
  let i = 0, shown = false, correct = 0;
  view.innerHTML = "";
  const back = h("button", { class: "back-link", onclick: () => renderVocab(view) }, "‹ Vokabeln");
  const prog = h("div", { class: "muted small" });
  const fc = h("div", { class: "fc" });
  const controls = h("div");
  view.append(back, prog, fc, controls);

  const next = () => {
    shown = false;
    if (i >= queue.length) {
      fc.innerHTML = "";
      fc.append(h("div", { class: "front" }, "Fertig! 🎉"),
        h("div", { class: "back" }, `${queue.length} Karten wiederholt.`));
      controls.innerHTML = "";
      controls.append(h("button", { class: "btn green", style: "width:100%", onclick: () => renderVocab(view) }, "Zurück"));
      return;
    }
    render();
  };

  const render = () => {
    const c = queue[i];
    prog.textContent = `Karte ${i + 1} / ${queue.length}`;
    fc.innerHTML = "";
    fc.append(h("div", { class: "front" }, c.front));
    if (c.grammar && c.grammar !== c.front) fc.append(h("div", { class: "muted small" }, c.grammar));
    controls.innerHTML = "";
    if (!shown) {
      fc.style.cursor = "pointer";
      fc.onclick = () => { shown = true; render(); };
      controls.append(h("button", { class: "btn", style: "width:100%", onclick: () => { shown = true; render(); } }, "Antwort zeigen"));
    } else {
      fc.onclick = null;
      fc.append(h("div", { class: "back" }, c.back || "(keine Übersetzung gespeichert)"),
        c.verbForms ? h("div", { class: "muted small", style: "margin-top:6px" }, c.verbForms) : null);
      const gbtn = (label, g, cls) =>
        h("button", { class: "btn " + cls, onclick: () => { grade(c, g); bumpActivity("reviews"); i++; next(); } }, label);
      controls.append(h("div", { class: "grade" },
        gbtn("Nochmal", 0, "soft"), gbtn("Schwer", 1, "soft"), gbtn("Gut", 2, "green"), gbtn("Leicht", 3, "blue")));
    }
  };
  next();
}

// ---- multiple choice quiz --------------------------------------------

function renderMcQuiz(view) {
  const all = Object.values(state.cards).filter((c) => c.back);
  const queue = shuffle(all).slice(0, 12);
  let i = 0, score = 0;
  view.innerHTML = "";
  view.append(h("button", { class: "back-link", onclick: () => renderVocab(view) }, "‹ Vokabeln"));
  const box = h("div");
  view.append(box);

  const ask = () => {
    if (i >= queue.length) {
      box.innerHTML = "";
      box.append(h("div", { class: "card", style: "text-align:center" },
        h("div", { class: "big-num" }, `${score} / ${queue.length}`),
        h("div", { class: "muted" }, "richtig beantwortet"),
        h("button", { class: "btn green", style: "margin-top:12px", onclick: () => renderVocab(view) }, "Fertig")));
      bumpActivity("drills");
      return;
    }
    const c = queue[i];
    const wrong = shuffle(all.filter((x) => x !== c)).slice(0, 3).map((x) => x.back);
    const opts = shuffle([c.back, ...wrong]);
    box.innerHTML = "";
    box.append(
      h("div", { class: "muted small" }, `Frage ${i + 1} / ${queue.length}`),
      h("div", { class: "card" },
        h("h2", {}, c.front),
        c.grammar && c.grammar !== c.front ? h("div", { class: "muted small" }, c.grammar) : null,
        ...opts.map((o) =>
          h("button", {
            class: "opt",
            onclick: (e) => {
              const right = o === c.back;
              if (right) score++;
              e.target.classList.add(right ? "correct" : "wrong");
              [...box.querySelectorAll(".opt")].forEach((b) => {
                b.disabled = true;
                if (b.textContent === c.back) b.classList.add("correct");
              });
              setTimeout(() => { i++; ask(); }, right ? 600 : 1400);
            },
          }, o))));
  };
  ask();
}

// ---- B1 wordlist browser ---------------------------------------------

let wlLetter = "A";
async function renderWordlistBrowser(view) {
  const list = await loadData("b1_wordlist");
  const wrap = h("div", { class: "card" },
    h("h3", {}, "Goethe-B1-Wortliste (Checkliste)"),
    h("div", { class: "muted small" }, "Hake Wörter ab, die du sicher kennst. Karten mit 2+ richtigen Wiederholungen zählen automatisch."));

  const letters = [...new Set(list.map((e) => e.lemma[0].toUpperCase()))].sort((a, b) => a.localeCompare(b, "de"));
  const lrow = h("div", { class: "letters" });
  const rows = h("div");

  const renderRows = () => {
    rows.innerHTML = "";
    const items = list.filter((e) => e.lemma[0].toUpperCase() === wlLetter);
    for (const e of items) {
      const key = wlKey(e);
      const known = !!state.wordKnown[key];
      const row = h("div", { class: "wl-row" },
        h("div", {
          class: "box check" + (known ? " done" : ""), style: "cursor:pointer",
          onclick: () => {
            if (state.wordKnown[key]) delete state.wordKnown[key];
            else state.wordKnown[key] = true;
            save(); renderRows();
          },
        }, h("span", { class: "box" + (known ? "" : ""), style: `width:20px;height:20px;border-radius:6px;border:2px solid var(--muted);display:grid;place-items:center;${known ? "background:var(--green);border-color:var(--green);color:#fff" : "color:transparent"}` }, "✓")),
        h("div", { class: "disp" + (known ? " muted" : "") }, e.display,
          e.forms ? h("span", { class: "muted small" }, " · " + e.forms) : null),
        h("button", {
          class: "btn ghost sm",
          onclick: () => addCard(e.lemma, { back: "", grammar: e.display, verbForms: e.forms ? e.lemma + ", " + e.forms : "", b1: true, source: "B1-Wortliste" }) || toast("Karte angelegt — Übersetzung beim Lesen antippen"),
        }, "＋"));
      rows.append(row);
    }
  };

  for (const L of letters) {
    lrow.append(h("button", {
      class: "chip" + (L === wlLetter ? " active" : ""),
      onclick: () => { wlLetter = L; [...lrow.children].forEach((c) => c.classList.toggle("active", c.textContent === L)); renderRows(); },
    }, L));
  }

  wrap.append(lrow, rows);
  renderRows();
  view.append(wrap);
}
