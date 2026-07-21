// Word lookup chain: essay glossary -> B1 wordlist -> cache -> free online APIs.
// Results are cached in localStorage so repeat taps work offline.

import { dictCache, saveCache, wordlistIndex } from "./core.js";

const clean = (w) => w.replace(/^[^A-Za-zÄÖÜäöüß]+|[^A-Za-zÄÖÜäöüß]+$/g, "");

// naive de-inflection candidates, best-effort (Häusern -> Häuser/Haus etc.)
function candidates(word) {
  const w = clean(word);
  const out = [w, w.toLowerCase(), w[0]?.toUpperCase() + w.slice(1)];
  const low = w.toLowerCase();
  for (const suf of ["es", "en", "er", "e", "n", "s", "st", "t", "em"]) {
    if (low.length > 4 && low.endsWith(suf)) {
      const stem = low.slice(0, -suf.length);
      out.push(stem, stem[0].toUpperCase() + stem.slice(1), stem + "e", stem + "en");
    }
  }
  return [...new Set(out.filter((x) => x && x.length > 1))];
}

function glossaryMatch(word, essay) {
  if (!essay?.glossary) return null;
  const cands = candidates(word).map((c) => c.toLowerCase());
  for (const g of essay.glossary) {
    // term like "Pandemie, -n (f.)" or "etwas in den Griff bekommen"
    const head = g.term.split(/[,(]/)[0].trim().toLowerCase();
    if (cands.includes(head) || head.split(/\s+/).includes(word.toLowerCase())) {
      return { term: g.term, def: g.def };
    }
  }
  return null;
}

async function wordlistMatch(word) {
  const idx = await wordlistIndex();
  for (const c of candidates(word)) {
    const e = idx.get(c.toLowerCase());
    if (e) return e;
  }
  return null;
}

async function fetchJson(url, timeoutMs = 6000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const stripTags = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function wiktionary(word) {
  for (const c of candidates(word).slice(0, 4)) {
    try {
      const data = await fetchJson(
        "https://en.wiktionary.org/api/rest_v1/page/definition/" + encodeURIComponent(c) + "?redirect=true"
      );
      for (const defs of Object.values(data)) {
        const german = defs.filter((d) => d.language === "German");
        if (german.length) {
          return german.map((d) => ({
            pos: d.partOfSpeech,
            defs: d.definitions.map((x) => stripTags(x.definition)).filter(Boolean).slice(0, 3),
          }));
        }
      }
    } catch {}
  }
  return null;
}

async function myMemory(word) {
  try {
    const data = await fetchJson(
      "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(word) + "&langpair=de|en"
    );
    const t = data?.responseData?.translatedText;
    if (t && !/NO QUERY|INVALID/i.test(t)) return t;
  } catch {}
  return null;
}

// Main lookup. Returns:
// { word, translation, gloss (German def), grammar (display like "die Nachricht, -en"),
//   verbForms, b1: bool, pos, online: bool }
export async function lookup(word, essay) {
  const w = clean(word);
  if (!w) return null;
  const res = { word: w, b1: false };

  const g = glossaryMatch(w, essay);
  if (g) {
    res.gloss = g.def;
    res.grammar = g.term;
  }

  const wl = await wordlistMatch(w);
  if (wl) {
    res.b1 = true;
    res.grammar = res.grammar || wl.display;
    res.pos = wl.pos;
    if (wl.forms) res.verbForms = wl.lemma + ", " + wl.forms;
  }

  const cached = dictCache[w.toLowerCase()];
  if (cached) {
    Object.assign(res, cached, { fromCache: true });
    return res;
  }

  if (navigator.onLine) {
    const [mm, wik] = await Promise.all([myMemory(w), wiktionary(w)]);
    if (mm) res.translation = mm;
    if (wik) {
      res.wiktionary = wik;
      if (!res.pos) res.pos = wik[0]?.pos?.toLowerCase();
      if (!res.translation) res.translation = wik[0]?.defs?.[0];
    }
    if (res.translation || res.wiktionary) {
      dictCache[w.toLowerCase()] = { translation: res.translation, wiktionary: res.wiktionary };
      saveCache();
      res.online = true;
    }
  }
  return res;
}
