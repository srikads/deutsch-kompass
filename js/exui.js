// Renders one exercise object (from exercises.js) as an interactive card.
// Used by the feed (feed.js) and path sessions (path.js).
//
//   renderExercise(ex, { onResult(right), onNext(), auto })
// onResult fires exactly once; a feedback banner with "Weiter" then calls
// onNext. With auto=true a correct answer advances on its own.

import { state, h, bumpActivity } from "./core.js";
import { checkTyped, checkBuild, shuffleR, ARTICLES } from "./exercises.js";
import { sayText, ttsSupported } from "./tts.js";
import { grade } from "./vocab.js";
import { fx } from "./fx.js";

const speakBtn = (text, big = false) =>
  ttsSupported() && text
    ? h("button", { class: "speak" + (big ? " big" : ""), "aria-label": "Vorlesen",
        onclick: (e) => { e.stopPropagation(); sayText(text, big ? 0.85 : 0.9); } }, "🔊")
    : null;

export function renderExercise(ex, { onResult, onNext, auto = false }) {
  const el = h("div", { class: "ex ex-" + ex.type });
  const body = h("div", { class: "ex-body" });
  const foot = h("div", { class: "ex-foot" });
  el.append(h("div", { class: "ex-kind" }, ex.kind), body, foot);

  let answered = false;
  const finish = (right, correctText, note) => {
    if (answered) return;
    answered = true;
    fx(right ? "right" : "wrong");
    onResult?.(right);
    foot.innerHTML = "";
    const next = h("button", { class: "btn " + (right ? "green" : ""), onclick: () => onNext?.() }, "Weiter");
    foot.append(h("div", { class: "banner " + (right ? "ok" : "bad") },
      h("div", { class: "banner-title" }, right ? pickPraise() : "Nicht ganz …"),
      !right && correctText ? h("div", {}, "Richtig: ", h("b", {}, correctText)) : null,
      note ? h("div", { class: "small", style: "margin-top:4px" }, note) : null,
      next));
    if (right && auto) setTimeout(() => el.isConnected && onNext?.(), 1100);
  };

  // auto-play audio when the card is shown (listen exercises)
  el.show = () => { if (ex.listen && ex.speak) sayText(ex.speak, 0.85); };

  (RENDER[ex.type] || RENDER.mc)(ex, body, foot, finish);
  return el;
}

const PRAISE = ["Richtig! 🎉", "Super! ✨", "Genau! 💪", "Klasse! 🔥", "Perfekt! 🌟", "Stark! 🚀", "Sehr gut! 👏"];
const pickPraise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];

const RENDER = {
  mc(ex, body, foot, finish) {
    body.append(h("div", { class: "ex-prompt" }, h("span", { html: ex.prompt }), " ", speakBtn(ex.speak)));
    const opts = ex.opts.map((o, i) =>
      h("button", {
        class: "opt",
        onclick: () => {
          opts.forEach((b, j) => {
            b.disabled = true;
            if (j === ex.a) b.classList.add("correct");
          });
          if (i !== ex.a) opts[i].classList.add("wrong");
          finish(i === ex.a, ex.opts[ex.a], ex.why);
        },
      }, o));
    body.append(h("div", { class: "opts" }, ...opts));
  },

  article(ex, body, foot, finish) {
    body.append(h("div", { class: "ex-word" }, ex.word, " ", speakBtn(ex.word)));
    const btns = ARTICLES.map((a, i) =>
      h("button", {
        class: "art art-" + a,
        onclick: () => {
          btns.forEach((b) => (b.disabled = true));
          btns[ex.a].classList.add("correct");
          if (i !== ex.a) btns[i].classList.add("wrong");
          finish(i === ex.a, ex.why, null);
        },
      }, a));
    body.append(h("div", { class: "arts" }, ...btns));
  },

  build(ex, body, foot, finish) {
    body.append(ex.listen
      ? h("div", { class: "ex-prompt" }, ex.prompt, h("div", { style: "margin-top:10px" }, speakBtn(ex.speak, true)))
      : h("div", { class: "ex-prompt" }, h("span", { class: "muted" }, "Übersetze: "), ex.prompt, " "));
    const line = h("div", { class: "build-line" });
    const bank = h("div", { class: "build-bank" });
    const chosen = [];
    const check = h("button", { class: "btn", disabled: true }, "Prüfen");
    const refresh = () => (check.disabled = !chosen.length);
    ex.tiles.forEach((word) => {
      const tile = h("button", { class: "tile-w" }, word);
      tile.onclick = () => {
        fx("tap");
        if (tile.parentElement === bank) {
          const ghost = h("span", { class: "tile-ghost" }, word);
          tile.replaceWith(ghost);
          tile._ghost = ghost;
          line.append(tile);
          chosen.push(tile);
        } else {
          tile._ghost.replaceWith(tile);
          chosen.splice(chosen.indexOf(tile), 1);
        }
        refresh();
      };
      bank.append(tile);
    });
    check.onclick = () => {
      const words = chosen.map((t) => t.textContent);
      [...line.children, ...bank.children].forEach((t) => (t.disabled = true));
      const right = checkBuild(words, ex.answer);
      line.classList.add(right ? "ok" : "bad");
      finish(right, ex.answer.join(" "), right ? ex.why : null);
    };
    body.append(line, bank);
    foot.append(check);
  },

  match(ex, body, foot, finish) {
    body.append(h("div", { class: "ex-prompt" }, "Tippe die passenden Paare an."));
    const left = shuffleR(ex.pairs.map((p, i) => ({ t: p[0], i })));
    const right = shuffleR(ex.pairs.map((p, i) => ({ t: p[1], i })));
    let sel = null, mistakes = 0, found = 0;
    const mk = (item, side) => {
      const b = h("button", { class: "match-b" }, item.t);
      b.onclick = () => {
        if (b.classList.contains("gone")) return;
        if (!sel || sel.side === side) {
          sel?.b.classList.remove("sel");
          sel = { b, item, side };
          b.classList.add("sel");
          if (side === "de") sayText(item.t);
          return;
        }
        if (sel.item.i === item.i) {
          fx("tap");
          [sel.b, b].forEach((x) => { x.classList.remove("sel"); x.classList.add("gone"); });
          if (++found === ex.pairs.length) finish(mistakes === 0, null, mistakes ? `${mistakes} Fehlversuch(e)` : null);
        } else {
          mistakes++;
          fx("wrong");
          [sel.b, b].forEach((x) => { x.classList.add("shake"); setTimeout(() => x.classList.remove("shake", "sel"), 400); });
        }
        sel = null;
      };
      return b;
    };
    body.append(h("div", { class: "match-grid" },
      h("div", {}, ...left.map((x) => mk(x, "de"))),
      h("div", {}, ...right.map((x) => mk(x, "en")))));
  },

  type(ex, body, foot, finish) {
    body.append(ex.listen
      ? h("div", { class: "ex-prompt" }, ex.prompt, h("div", { style: "margin-top:10px" }, speakBtn(ex.speak, true)))
      : h("div", { class: "ex-prompt", html: ex.prompt }));
    const input = h("input", { type: "text", class: "type-in", autocomplete: "off", autocapitalize: "off",
      autocorrect: "off", spellcheck: "false", lang: "de", placeholder: "Antwort auf Deutsch…" });
    const uml = h("div", { class: "uml" }, ...["ä", "ö", "ü", "ß"].map((c) =>
      h("button", { class: "chip", onclick: () => { input.value += c; input.focus(); } }, c)));
    const check = h("button", { class: "btn" }, "Prüfen");
    const go = () => {
      if (!input.value.trim()) return;
      input.disabled = true;
      const r = checkTyped(input.value, ex.answer);
      finish(r.ok, ex.answer, r.typo ? `Fast! Richtig geschrieben: ${ex.answer}` : null);
    };
    check.onclick = go;
    input.addEventListener("keydown", (e) => e.key === "Enter" && go());
    body.append(input, uml);
    foot.append(check);
  },

  flash(ex, body, foot, finish) {
    const back = h("div", { class: "fc-back", hidden: true }, ex.back || "—");
    body.append(h("div", { class: "ex-word" }, ex.front, " ", speakBtn(ex.front)), back);
    const reveal = h("button", { class: "btn blue" }, "Aufdecken");
    reveal.onclick = () => {
      back.hidden = false;
      foot.innerHTML = "";
      const g = (right) => () => {
        const card = state.cards[ex.front];
        if (card) grade(card, right ? 2 : 0);
        bumpActivity("reviews", 1, 0);
        finish(right, null, null);
      };
      foot.append(h("div", { class: "row" },
        h("button", { class: "btn grow", onclick: g(false) }, "😬 Nochmal"),
        h("button", { class: "btn green grow", onclick: g(true) }, "✅ Gewusst")));
    };
    foot.append(reveal);
  },
};
