// Shared state, storage, data loading and small UI helpers.

const STATE_KEY = "dk_state_v1";
const CACHE_KEY = "dk_dictcache_v1";

export const state = load(STATE_KEY, {
  settings: { examDate: defaultExamDate(), dailyEssays: 1, dailyReviews: 30 },
  essaysRead: {},     // essayId -> ISO date
  cards: {},          // word -> card
  wordKnown: {},      // wordlist key -> true (self-marked as known)
  planDone: {},       // taskId -> ISO date
  lesenDone: {},      // setId -> {score, total, date}
  schreibenDone: {},  // promptId -> ISO date
  drillStats: {},     // drillTopic -> {right, wrong}
  activity: {},       // ISO date -> {reviews, essays, drills, lesen, schreiben, newCards}
});

export const dictCache = load(CACHE_KEY, {});

function defaultExamDate() {
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d.toISOString().slice(0, 10);
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return Object.assign(fallback, JSON.parse(raw));
  } catch {}
  return fallback;
}

export function save() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}
export function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(dictCache));
  } catch {
    // cache full -> drop it and start fresh
    for (const k of Object.keys(dictCache)) delete dictCache[k];
    localStorage.removeItem(CACHE_KEY);
  }
}

export const today = () => new Date().toISOString().slice(0, 10);

export function bumpActivity(field, n = 1) {
  const t = today();
  const a = (state.activity[t] = state.activity[t] || {});
  a[field] = (a[field] || 0) + n;
  save();
}

export function daysToExam() {
  const ms = new Date(state.settings.examDate) - new Date(today());
  return Math.max(0, Math.round(ms / 86400000));
}

export function streak() {
  // consecutive days (ending today or yesterday) with any activity
  let n = 0;
  const d = new Date();
  if (!state.activity[d.toISOString().slice(0, 10)]) d.setDate(d.getDate() - 1);
  while (state.activity[d.toISOString().slice(0, 10)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// ---- bundled data -------------------------------------------------------

const dataCache = {};
export async function loadData(name) {
  if (!dataCache[name]) {
    dataCache[name] = fetch(`data/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`${name}.json: HTTP ${r.status}`);
      return r.json();
    });
  }
  return dataCache[name];
}

// B1 wordlist indexed by lowercase lemma for fast lookup
let wlIndex = null;
export async function wordlistIndex() {
  if (!wlIndex) {
    const list = await loadData("b1_wordlist");
    wlIndex = new Map();
    for (const e of list) {
      const k = e.lemma.toLowerCase();
      if (!wlIndex.has(k)) wlIndex.set(k, e);
    }
  }
  return wlIndex;
}

export function wlKey(entry) {
  return (entry.article ? entry.article + " " : "") + entry.lemma;
}

// ---- tiny DOM helpers ---------------------------------------------------

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children.filter((c) => c != null));
  return el;
}

export function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = h("div", { class: "toast" });
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 1800);
}

const sheetEl = () => document.getElementById("sheet");
const backdropEl = () => document.getElementById("sheet-backdrop");

export function openSheet(contentEl) {
  const s = sheetEl(), b = backdropEl();
  s.innerHTML = "";
  s.append(contentEl);
  s.hidden = false;
  b.hidden = false;
  b.onclick = closeSheet;
}
export function closeSheet() {
  sheetEl().hidden = true;
  backdropEl().hidden = true;
}

export function pct(a, b) {
  return b ? Math.round((100 * a) / b) : 0;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
