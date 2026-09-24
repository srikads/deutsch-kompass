// Feed: the home tab. A vertical, swipeable (scroll-snap) stream of bite-sized
// exercises — Reels for German. Endless: new cards are generated as you go.

import { state, h, loadData, bumpActivity, today } from "./core.js";
import { registerAnswer, buildPath, pathStatus } from "./game.js";
import { feedBatch, splitSentences, perfektVerbs, tokenize } from "./exercises.js";
import { renderExercise } from "./exui.js";
import { dueCards } from "./vocab.js";
import { getLessons } from "./lernen.js";
import { fx, xpPop } from "./fx.js";
import { openBlitzPicker } from "./blitz.js";

// ---- shared exercise context (also used by path + blitz) ---------------

let base = null;
async function loadBase() {
  if (base) return base;
  const [drills, wordlist, extra, lessons, essays] = await Promise.all([
    loadData("drills"), loadData("b1_wordlist"), loadData("feed_extra"), getLessons(), loadData("essays"),
  ]);
  const sentences = essays.flatMap((e) => {
    const words = tokenize(e.text);
    return splitSentences(e.text).map((text) => ({ text, words, title: e.title }));
  });
  base = {
    drills,
    nouns: wordlist.filter((e) => e.pos === "noun" && /^(der|die|das)$/.test(e.article)),
    verbs: perfektVerbs(wordlist),
    coreWords: extra.words,
    idioms: extra.idioms,
    examples: lessons.flatMap((l) => l.examples || []).filter((e) => e.de && e.en),
    sentences,
    lessons,
  };
  return base;
}

// user cards with a translation join the core word pool
export async function loadCtx() {
  const b = await loadBase();
  const mine = Object.values(state.cards).filter((c) => c.back).map((c) => ({ de: c.front, en: c.back }));
  return { ...b, words: [...b.coreWords, ...mine], due: dueCards() };
}

// ---- feed view ------------------------------------------------------------

export async function renderFeed(view) {
  view.innerHTML = "";
  view.classList.add("feedmode");
  const ctx = await loadCtx();

  const combo = h("span", { class: "combo" });
  const setCombo = () => {
    const c = state.game.combo;
    combo.textContent = c >= 2 ? `🔥 ${c}er-Combo` : "Wisch nach oben ↑";
    combo.classList.toggle("hot", c >= 5);
  };
  setCombo();
  view.append(h("div", { class: "feed-hud" }, combo,
    h("button", { class: "btn sm blitz-btn", onclick: () => openBlitzPicker(view, () => renderFeed(view)) }, "⚡ Blitz")));

  const feed = h("div", { class: "feed" });
  view.append(feed);

  const cards = [];
  let lastGen = null;
  const observer = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const idx = cards.indexOf(en.target);
      en.target.querySelector(".ex")?.show?.();
      if (idx >= cards.length - 3) more();
    }
  }, { root: feed, threshold: 0.6 });

  const goNext = (card) => {
    const i = cards.indexOf(card);
    if (i >= cards.length - 2) more();
    const nxt = cards[i + 1];
    if (nxt) feed.scrollTo({ top: nxt.offsetTop, behavior: "smooth" });
  };

  const addCard = (content, tint) => {
    const card = h("section", { class: "fcard" }, h("div", { class: "fcard-in t" + tint }, content));
    feed.append(card);
    cards.push(card);
    observer.observe(card);
    return card;
  };

  function more() {
    const fresh = feedBatch({ ...ctx, due: dueCards() }, 8, Math.random, lastGen);
    fresh.forEach((ex, k) => {
      lastGen = ex.gen;
      let card;
      const el = renderExercise(ex, {
        auto: true,
        onResult: (right) => {
          const r = registerAnswer(state.game, right);
          bumpActivity("feed", 1, r.xp);
          if (r.xp) xpPop(r.xp, el.querySelector(".banner") || el);
          if (r.bonus) fx("combo");
          setCombo();
        },
        onNext: () => goNext(card),
      });
      card = addCard(el, cards.length % 6);
      // every 7th card: a nudge towards the bigger activities
      if (cards.length % 7 === 6) addCard(nudge(ctx), "n");
    });
  }
  more();
}

let nudgeTurn = 0;
function nudge(ctx) {
  const kind = nudgeTurn++ % 3;
  const go = (detail) => window.dispatchEvent(new CustomEvent("dk-go", { detail }));
  if (kind === 0) {
    const act = state.activity[today()] || {};
    return h("div", { class: "nudge" },
      h("div", { class: "nudge-emoji" }, "📖"),
      h("div", { class: "nudge-title" }, act.essays ? "Noch ein Essay?" : "Dein Essay für heute"),
      h("div", { class: "muted" }, "Echte DW-Texte, Wörter antippen, vorlesen lassen."),
      h("button", { class: "btn", onclick: () => go({ tab: "library", nextEssay: true }) }, "Lesen · +30 XP"));
  }
  if (kind === 1) {
    const units = buildPath(ctx.lessons);
    const st = pathStatus(units, state.game.path);
    const cur = units.flatMap((u) => u.nodes).find((n) => st[n.id] === "current");
    return h("div", { class: "nudge" },
      h("div", { class: "nudge-emoji" }, "🗺️"),
      h("div", { class: "nudge-title" }, cur ? `Lernpfad: ${cur.title}` : "Lernpfad"),
      h("div", { class: "muted" }, "Eine Lektion, 8 Übungen, Sterne sammeln."),
      h("button", { class: "btn blue", onclick: () => go({ tab: "practice" }) }, "Weiter im Pfad · +20 XP"));
  }
  const best = Math.max(0, ...Object.values(state.game.best));
  return h("div", { class: "nudge" },
    h("div", { class: "nudge-emoji" }, "⚡"),
    h("div", { class: "nudge-title" }, "60-Sekunden-Blitz"),
    h("div", { class: "muted" }, best ? `Dein Rekord: ${best}. Knackst du ihn?` : "Wie viele schaffst du in einer Minute?"),
    h("button", { class: "btn green", onclick: () => go({ tab: "blitz" }) }, "Blitz starten"));
}
