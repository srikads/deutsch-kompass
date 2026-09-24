// Guards for app-level wiring that has bitten before: offline cache list,
// bundled content shape, and the reader player placement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("service worker precaches every js module and data file the app loads", () => {
  const sw = read("sw.js");
  for (const f of readdirSync(new URL("../js", import.meta.url)))
    assert.ok(sw.includes(`"./js/${f}"`), `sw.js SHELL is missing js/${f}`);
  for (const name of ["essays", "b1_wordlist", "drills", "lesen_sets", "schreiben", "plan", "lessons", "feed_extra"])
    assert.ok(sw.includes(`"./data/${name}.json"`), `sw.js SHELL is missing data/${name}.json`);
});

test("feed_extra.json: well-formed words and idioms, no duplicates", () => {
  const { words, idioms } = JSON.parse(read("data/feed_extra.json"));
  assert.ok(words.length >= 100);
  assert.ok(idioms.length >= 30);
  for (const w of words) assert.ok(w.de && w.en, JSON.stringify(w));
  for (const i of idioms) assert.ok(i.de && i.literal && i.meaning && i.example, JSON.stringify(i));
  assert.equal(new Set(words.map((w) => w.de)).size, words.length, "duplicate German word");
  assert.equal(new Set(words.map((w) => w.en)).size, words.length, "duplicate English gloss (ambiguous MC)");
  assert.equal(new Set(idioms.map((i) => i.meaning)).size, idioms.length, "duplicate idiom meaning");
  // nouns carry their article so typing exercises teach it
  for (const w of words.filter((x) => /^[A-ZÄÖÜ]/.test(x.de.split(" ").at(-1)) && x.de.includes(" ")))
    assert.match(w.de, /^(der|die|das) /, w.de);
});

test("reader player is fixed at the bottom, not stuck under the back link", () => {
  const css = read("css/app.css");
  const rule = css.match(/\.player\s*\{[^}]*\}/)?.[0] || "";
  assert.match(rule, /position:\s*fixed/);
  assert.match(rule, /bottom:/);
  assert.doesNotMatch(css, /\.audiobar\s*\{[^}]*sticky/);
  const reader = read("js/reader.js");
  assert.ok(reader.includes('class: "player"'));
  assert.ok(!reader.includes('"audio", { controls'), "old top <audio controls> bar is gone");
});

test("tab switches stop the essay audio", () => {
  const app = read("js/app.js");
  const go = app.slice(app.indexOf("function go("), app.indexOf("tabs.forEach"));
  assert.ok(go.includes("stopReaderAudio()"));
});
