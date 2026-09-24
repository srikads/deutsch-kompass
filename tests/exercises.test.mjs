import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rngFrom, normalize, checkTyped, tokenize, checkBuild, splitSentences,
  articleEx, perfektEx, perfektVerbs, wordMc, buildEx, clozeEx, idiomEx, matchEx,
  feedBatch, lessonSession, blitzItem, BLITZ_MODES, ARTICLES,
} from "../js/exercises.js";

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), "utf8"));

// ---- answer checking --------------------------------------------------

test("normalize folds case, punctuation and umlauts", () => {
  assert.equal(normalize("  Schön, oder?! "), "schoen oder");
  assert.equal(normalize("die Straße"), normalize("Die Strasse"));
  assert.equal(normalize("„Grüß Gott“"), "gruess gott");
});

test("checkTyped accepts exact, umlaut-free and one-typo answers", () => {
  assert.deepEqual(checkTyped("die Wohnung", "die Wohnung"), { ok: true, typo: false });
  assert.deepEqual(checkTyped("puenktlich", "pünktlich"), { ok: true, typo: false });
  assert.deepEqual(checkTyped("die Wohnug", "die Wohnung"), { ok: true, typo: true });
  assert.equal(checkTyped("der Wohnung", "die Wohnung").ok, false, "wrong article is wrong");
  assert.equal(checkTyped("Hut", "Hat").ok, false, "no typo tolerance for short words");
  assert.equal(checkTyped("", "egal").ok, false);
});

test("tokenize / checkBuild ignore punctuation but keep word order", () => {
  assert.deepEqual(tokenize("Hast du alles verstanden?"), ["Hast", "du", "alles", "verstanden"]);
  const ans = tokenize("Ich habe überall gesucht.");
  assert.equal(checkBuild(["Ich", "habe", "überall", "gesucht"], ans), true);
  assert.equal(checkBuild(["Ich", "überall", "habe", "gesucht"], ans), false);
});

test("splitSentences keeps mid-length sentences without quotes", () => {
  const text = "Das ist kurz. Heute gehe ich mit meiner Freundin in den Park spazieren. Er sagte: „Nein.“\n\nMorgen fahren wir alle zusammen mit dem Zug nach Berlin.";
  assert.deepEqual(splitSentences(text), [
    "Heute gehe ich mit meiner Freundin in den Park spazieren.",
    "Morgen fahren wir alle zusammen mit dem Zug nach Berlin.",
  ]);
});

// ---- generators ------------------------------------------------------

test("articleEx and perfektEx map the right answer", () => {
  const a = articleEx({ lemma: "Anschluss", article: "der", display: "der Anschluss" });
  assert.equal(ARTICLES[a.a], "der");
  const p = perfektEx({ lemma: "fahren", forms: "fährt, fuhr, ist gefahren" });
  assert.equal(p.opts[p.a], "ist gefahren");
});

test("buildEx tiles = answer words + 2 distractors not in the answer", () => {
  const r = rngFrom(1);
  const ex = buildEx("Ich habe überall gesucht.", "I looked everywhere.", ["Katze", "habe", "Tisch", "rot"], r);
  assert.deepEqual(ex.answer, ["Ich", "habe", "überall", "gesucht"]);
  assert.equal(ex.tiles.length, 6);
  for (const w of ex.answer) assert.ok(ex.tiles.includes(w));
  const extra = ex.tiles.filter((t) => !ex.answer.includes(t));
  assert.equal(extra.length, 2);
  assert.ok(!extra.includes("habe"));
});

test("clozeEx blanks a real word and never offers it twice", () => {
  const s = "Viele Menschen fahren morgens mit dem Fahrrad zur Arbeit.";
  const words = tokenize(s + " Kinder spielen gerne draußen im Garten und Autos stehen oft lange im Stau herum.");
  for (let seed = 0; seed < 30; seed++) {
    const ex = clozeEx(s, words, rngFrom(seed));
    if (!ex) continue;
    const ans = ex.opts[ex.a];
    assert.ok(ex.prompt.includes("_____"));
    assert.ok(s.includes(ans));
    assert.equal(new Set(ex.opts).size, 4);
    const upper = (x) => x[0] === x[0].toUpperCase();
    assert.ok(ex.opts.every((o) => upper(o) === upper(ans)), "distractors match capitalisation");
  }
});

// ---- property checks on the real bundled data --------------------------

function realCtx() {
  const wl = load("b1_wordlist");
  const extra = load("feed_extra");
  const lessons = load("lessons");
  const essays = load("essays");
  return {
    drills: load("drills"),
    nouns: wl.filter((e) => e.pos === "noun" && /^(der|die|das)$/.test(e.article)),
    verbs: perfektVerbs(wl),
    words: extra.words,
    idioms: extra.idioms,
    examples: lessons.flatMap((l) => l.examples || []).filter((e) => e.de && e.en),
    sentences: essays.flatMap((e) => {
      const words = tokenize(e.text);
      return splitSentences(e.text).map((text) => ({ text, words, title: e.title }));
    }),
    due: [{ front: "die Wohnung", back: "apartment" }],
    lessons,
  };
}

function assertValid(ex) {
  assert.ok(ex.type && ex.kind, "has type + kind");
  if (ex.type === "mc") {
    assert.ok(ex.opts.length >= 2);
    assert.ok(ex.a >= 0 && ex.a < ex.opts.length, `answer index in range: ${ex.prompt}`);
    assert.equal(new Set(ex.opts).size, ex.opts.length, `options unique: ${ex.prompt} ${ex.opts}`);
  } else if (ex.type === "article") {
    assert.ok(ex.a >= 0 && ex.a < 3);
  } else if (ex.type === "build") {
    assert.ok(ex.answer.length > 0);
    const bag = [...ex.tiles];
    for (const w of ex.answer) {
      const i = bag.indexOf(w);
      assert.ok(i >= 0, `tile for "${w}"`);
      bag.splice(i, 1);
    }
  } else if (ex.type === "match") {
    assert.equal(ex.pairs.length, 5);
  } else if (ex.type === "type") {
    assert.ok(ex.answer);
  } else if (ex.type === "flash") {
    assert.ok(ex.front);
  } else assert.fail("unknown type " + ex.type);
}

test("feedBatch over real data: 400 valid exercises, variety, no immediate repeats", () => {
  const ctx = realCtx();
  const r = rngFrom(42);
  const all = [];
  let last = null;
  for (let i = 0; i < 50; i++) {
    const batch = feedBatch(ctx, 8, r, last);
    assert.equal(batch.length, 8);
    last = batch.at(-1).gen;
    all.push(...batch);
  }
  all.forEach(assertValid);
  for (let i = 1; i < all.length; i++) assert.notEqual(all[i].gen, all[i - 1].gen);
  const gens = new Set(all.map((e) => e.gen));
  assert.ok(gens.size >= 9, `uses many exercise kinds (${[...gens]})`);
});

test("feedBatch copes with a brand-new user (no cards due)", () => {
  const ctx = { ...realCtx(), due: [] };
  const b = feedBatch(ctx, 20, rngFrom(3));
  assert.equal(b.length, 20);
  assert.ok(!b.some((e) => e.type === "flash"));
});

test("lessonSession: every lesson yields a full, valid session", () => {
  const ctx = realCtx();
  const drills = ctx.drills;
  for (const [i, l] of ctx.lessons.entries()) {
    const s = lessonSession([l], drills[i % drills.length], ctx, rngFrom(i), 8);
    assert.equal(s.length, 8, l.title);
    s.forEach(assertValid);
  }
});

test("blitz items are answerable for every mode", () => {
  const ctx = realCtx();
  const r = rngFrom(7);
  for (const mode of Object.keys(BLITZ_MODES)) {
    for (let i = 0; i < 200; i++) {
      const it = blitzItem(mode, ctx, r);
      assert.ok(it.prompt);
      assert.ok(it.a >= 0 && it.a < it.opts.length);
    }
  }
});

test("wordMc / idiomEx / matchEx on bundled content", () => {
  const { words, idioms } = load("feed_extra");
  const r = rngFrom(9);
  assertValid(wordMc(words[0], words, r, "de"));
  assertValid(wordMc(words[5], words, r, "en"));
  assertValid(idiomEx(idioms[0], idioms, r));
  assertValid(matchEx(words.slice(0, 5)));
});
