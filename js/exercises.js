// Exercise generators + answer checking. Pure (no DOM): every generator takes
// plain data and an rng, and returns a plain exercise object that js/exui.js
// renders. Unit-tested in tests/exercises.test.mjs.
//
// Exercise shapes (all have `type` and `kind`, a short label for the card):
//   mc      { prompt(html), opts[], a, why?, speak? }
//   article { word, a (index into ARTICLES), why }
//   build   { prompt, answer[], tiles[], speak?, listen? }
//   match   { pairs: [[de, en]…] }
//   type    { prompt, answer, speak?, listen? }
//   flash   { front, back }

export const ARTICLES = ["der", "die", "das"];

// ---- rng helpers -------------------------------------------------------

export function rngFrom(seed) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleR(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const pickR = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];
export const sampleR = (arr, n, rng = Math.random) => shuffleR(arr, rng).slice(0, n);

// ---- answer checking ---------------------------------------------------

const PUNCT = /[.,!?;:„“”"'«»‚‘’()–—…]/g;

// Case/punctuation-insensitive; ä/ö/ü/ß fold to ae/oe/ue/ss so a phone
// keyboard without umlauts still works.
export function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(PUNCT, " ")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// { ok, typo } — one wrong letter is forgiven for answers of 6+ chars
export function checkTyped(input, answer) {
  const x = normalize(input), y = normalize(answer);
  if (!x) return { ok: false, typo: false };
  if (x === y) return { ok: true, typo: false };
  if (y.length >= 6 && levenshtein(x, y) === 1) return { ok: true, typo: true };
  return { ok: false, typo: false };
}

// words of a sentence without punctuation, original case kept
export function tokenize(sentence) {
  return sentence.replace(PUNCT, " ").split(/\s+/).filter(Boolean);
}

export function checkBuild(chosen, answer) {
  return normalize(chosen.join(" ")) === normalize(answer.join(" "));
}

// ---- sentence harvesting ----------------------------------------------

export function splitSentences(text, min = 5, max = 14) {
  return text
    .split(/\n+/)
    .flatMap((p) => p.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/))
    .map((s) => s.trim())
    .filter((s) => /[.!?]$/.test(s) && !/["„“”»«:]/.test(s))
    .filter((s) => { const n = s.split(/\s+/).length; return n >= min && n <= max; });
}

// ---- generators --------------------------------------------------------

export function mcFromDrill(q, kind = "🧠 Grammatik") {
  return { type: "mc", kind, prompt: q.q, opts: q.opts, a: q.a, why: q.why };
}

export function articleEx(entry) {
  return { type: "article", kind: "⚖️ der / die / das", word: entry.lemma,
    a: ARTICLES.indexOf(entry.article), why: entry.display };
}

const PERF_RE = /\b(hat|ist) (\S+)\s*$/;
export const perfektVerbs = (wordlist) =>
  wordlist.filter((e) => e.pos === "verb" && PERF_RE.test(e.forms || ""));

export function perfektEx(entry, rng = Math.random) {
  const [, aux, part] = entry.forms.match(PERF_RE);
  const opts = ["hat " + part, "ist " + part];
  return { type: "mc", kind: "⏪ Perfekt", prompt: `Perfekt von <b>${entry.lemma}</b>?`,
    opts, a: aux === "hat" ? 0 : 1, why: `${entry.lemma}: ${entry.forms}` };
}

// word {de, en}: de→en or en→de multiple choice with 3 distractors
export function wordMc(word, pool, rng = Math.random, dir = rng() < 0.5 ? "de" : "en") {
  const others = sampleR(pool.filter((w) => w.en !== word.en && w.de !== word.de), 3, rng);
  const key = dir === "de" ? "en" : "de";
  const opts = shuffleR([word, ...others], rng);
  return {
    type: "mc", kind: "🗂️ Vokabel",
    prompt: dir === "de" ? `Was heißt <b>${word.de}</b>?` : `Wie sagt man <b>${word.en}</b>?`,
    opts: opts.map((o) => o[key]), a: opts.indexOf(word),
    speak: dir === "de" ? word.de : null,
    why: `${word.de} = ${word.en}`,
  };
}

export function typeEx(word, listen = false) {
  return listen
    ? { type: "type", kind: "🎧 Hören & tippen", listen: true, prompt: "Was hörst du?", answer: word.de, speak: word.de }
    : { type: "type", kind: "⌨️ Schreiben", prompt: `Auf Deutsch: <b>${word.en}</b>`, answer: word.de, speak: word.de };
}

// sentence builder (Duolingo-style word tiles); listen=true hides the prompt
export function buildEx(de, en, pool, rng = Math.random, listen = false) {
  const answer = tokenize(de);
  const lower = new Set(answer.map((w) => w.toLowerCase()));
  const extra = sampleR([...new Set(pool)].filter((w) => !lower.has(w.toLowerCase())), 2, rng);
  return {
    type: "build", kind: listen ? "🎧 Hören & bauen" : "🧩 Satzbau",
    prompt: listen ? "Bau den Satz, den du hörst." : en,
    listen, answer, tiles: shuffleR([...answer, ...extra], rng), speak: de, why: de + (en ? ` — ${en}` : ""),
  };
}

export function translateMc(ex, pool, rng = Math.random) {
  const others = sampleR(pool.filter((p) => p.en !== ex.en), 3, rng);
  const opts = shuffleR([ex, ...others], rng);
  return { type: "mc", kind: "💬 Verstehen", prompt: `<b>${ex.de}</b>`, speak: ex.de,
    opts: opts.map((o) => o.en), a: opts.indexOf(ex), why: ex.note || "" };
}

export function matchEx(pairs) {
  return { type: "match", kind: "🔗 Paare finden", pairs: pairs.map((p) => [p.de, p.en]) };
}

// cloze on a real DW sentence: distractors come from the same essay and
// share capitalisation (noun vs non-noun) so they look plausible
export function clozeEx(sentence, essayWords, rng = Math.random, title = "") {
  const toks = sentence.split(/\s+/);
  const clean = (w) => w.replace(PUNCT, "");
  const cand = toks
    .map((w, i) => ({ i, w: clean(w) }))
    .filter(({ i, w }) => i > 0 && w.length >= 4 && /^[A-Za-zÄÖÜäöüß]+$/.test(w));
  if (!cand.length) return null;
  const { i, w } = pickR(cand, rng);
  const upper = (s) => s[0] === s[0].toUpperCase();
  const pool = [...new Set(essayWords.map(clean))].filter((x) =>
    x !== w && x.length >= 3 && /^[A-Za-zÄÖÜäöüß]+$/.test(x) &&
    upper(x) === upper(w) && Math.abs(x.length - w.length) <= 3);
  if (pool.length < 3) return null;
  const opts = shuffleR([w, ...sampleR(pool, 3, rng)], rng);
  const shown = toks.map((t, j) => (j === i ? t.replace(w, "_____") : t)).join(" ");
  return { type: "mc", kind: "📰 DW-Satz", prompt: shown, opts, a: opts.indexOf(w),
    why: sentence + (title ? ` (${title})` : ""), speak: sentence };
}

export function idiomEx(idiom, idioms, rng = Math.random) {
  const others = sampleR(idioms.filter((x) => x !== idiom), 3, rng);
  const opts = shuffleR([idiom, ...others], rng);
  return { type: "mc", kind: "🥨 Redewendung",
    prompt: `Was bedeutet <b>„${idiom.de}“</b>?<div class="lit">wörtlich: ${idiom.literal}</div>`,
    opts: opts.map((o) => o.meaning), a: opts.indexOf(idiom), speak: idiom.de,
    why: `Beispiel: ${idiom.example}` };
}

export function flashEx(card) {
  return { type: "flash", kind: "🔁 Wiederholen", front: card.front, back: card.back || card.grammar || "" };
}

// ---- mixes ------------------------------------------------------------

// ctx: { drills, nouns, verbs, words, idioms, examples, sentences, due }
//   words     [{de,en}] (core words + user cards with translations)
//   examples  [{de,en,note}] (lesson example sentences)
//   sentences [{text, words, title}] (DW essay sentences)
//   due       SRS cards due today
const GENS = {
  article: (c, r) => c.nouns.length && articleEx(pickR(c.nouns, r)),
  perfekt: (c, r) => c.verbs.length && perfektEx(pickR(c.verbs, r), r),
  drill: (c, r) => {
    const d = c.drills.length && pickR(c.drills, r);
    return d && mcFromDrill(pickR(d.questions, r));
  },
  word: (c, r) => c.words.length >= 4 && wordMc(pickR(c.words, r), c.words, r),
  type: (c, r) => c.words.length && typeEx(pickR(c.words, r), r() < 0.5),
  build: (c, r) => {
    const ex = c.examples.filter((e) => tokenize(e.de).length <= 9);
    if (!ex.length) return null;
    const e = pickR(ex, r);
    return buildEx(e.de, e.en, c.examples.flatMap((x) => tokenize(x.de)), r, r() < 0.35);
  },
  translate: (c, r) => c.examples.length >= 4 && translateMc(pickR(c.examples, r), c.examples, r),
  match: (c, r) => c.words.length >= 5 && matchEx(sampleR(c.words, 5, r)),
  cloze: (c, r) => {
    const s = c.sentences.length && pickR(c.sentences, r);
    return s && clozeEx(s.text, s.words, r, s.title);
  },
  idiom: (c, r) => c.idioms.length >= 4 && idiomEx(pickR(c.idioms, r), c.idioms, r),
  flash: (c, r) => c.due.length && flashEx(pickR(c.due, r)),
};

const WEIGHTS = { article: 3, perfekt: 2, drill: 3, word: 3, type: 2, build: 3, translate: 2, match: 1, cloze: 3, idiom: 2, flash: 3 };

export function feedBatch(ctx, n, rng = Math.random, lastType = null) {
  const out = [];
  let guard = 0;
  let last = lastType;
  const bag = Object.entries(WEIGHTS).flatMap(([k, w]) => Array(w).fill(k));
  while (out.length < n && guard++ < n * 20) {
    const gen = pickR(bag, rng);
    if (gen === last) continue; // never the same kind twice in a row
    const ex = GENS[gen](ctx, rng);
    if (!ex) continue;
    ex.gen = gen;
    out.push(ex);
    last = gen;
  }
  return out;
}

// a path session for one or more lessons: their example sentences in
// several exercise formats + questions from the topic's drill
export function lessonSession(lessons, drill, ctx, rng = Math.random, size = 8) {
  const examples = lessons.flatMap((l) => l.examples || []).filter((e) => e.de && e.en);
  const pool = [...examples, ...ctx.examples];
  const tokPool = pool.flatMap((x) => tokenize(x.de));
  const out = [];
  for (const [i, e] of shuffleR(examples, rng).entries()) {
    if (out.length >= Math.ceil(size * 0.6)) break;
    const n = tokenize(e.de).length;
    const mode = i % 3;
    if (mode === 0 && n <= 10) out.push(buildEx(e.de, e.en, tokPool, rng));
    else if (mode === 1 && n <= 9) out.push(buildEx(e.de, e.en, tokPool, rng, true));
    else if (pool.length >= 4) out.push(translateMc(e, pool, rng));
  }
  const qs = drill ? shuffleR(drill.questions, rng) : [];
  for (const q of qs) {
    if (out.length >= size) break;
    out.push(mcFromDrill(q));
  }
  // top up with generic items if the lesson is thin
  const fill = feedBatch({ ...ctx, due: [] }, size - out.length, rng);
  return shuffleR([...out, ...fill], rng).slice(0, size);
}

// ---- blitz ------------------------------------------------------------

export const BLITZ_MODES = {
  artikel: { title: "der / die / das", icon: "⚖️", sub: "Artikel so schnell wie möglich" },
  perfekt: { title: "hat oder ist?", icon: "⏪", sub: "Hilfsverb im Perfekt" },
  wort: { title: "Wort-Sprint", icon: "🗂️", sub: "Deutsch → Englisch" },
};

// { prompt, opts[], a, why }
export function blitzItem(mode, ctx, rng = Math.random) {
  if (mode === "artikel") {
    const e = pickR(ctx.nouns, rng);
    return { prompt: e.lemma, opts: ARTICLES, a: ARTICLES.indexOf(e.article), why: e.display };
  }
  if (mode === "perfekt") {
    const e = pickR(ctx.verbs, rng);
    const [, aux, part] = e.forms.match(PERF_RE);
    return { prompt: `${e.lemma} → ___ ${part}`, opts: ["hat", "ist"], a: aux === "hat" ? 0 : 1, why: e.forms };
  }
  const w = pickR(ctx.words, rng);
  const other = pickR(ctx.words.filter((x) => x.en !== w.en), rng);
  const opts = shuffleR([w.en, other.en], rng);
  return { prompt: w.de, opts, a: opts.indexOf(w.en), why: `${w.de} = ${w.en}` };
}
