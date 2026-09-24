// Blitz: 60-second speed rounds (der/die/das, hat/ist, word sprint) with a
// personal high score per mode. 1 XP per correct answer.

import { state, save, h, bumpActivity, openSheet, closeSheet } from "./core.js";
import { BLITZ_MODES, blitzItem } from "./exercises.js";
import { fx, celebrate, xpPop } from "./fx.js";
import { loadCtx } from "./feed.js";

const SECONDS = 60;

export function openBlitzPicker(view, onExit) {
  const box = h("div", {}, h("div", { class: "word" }, "⚡ Blitz-Challenge"),
    h("div", { class: "muted small", style: "margin:4px 0 10px" }, "60 Sekunden. So viele richtige Antworten wie möglich."));
  for (const [id, m] of Object.entries(BLITZ_MODES)) {
    const best = state.game.best[id] || 0;
    box.append(h("button", {
      class: "blitz-mode",
      onclick: () => { closeSheet(); runBlitz(view, id, onExit); },
    }, h("span", { class: "blitz-ico" }, m.icon),
      h("span", { class: "grow" }, h("b", {}, m.title), h("div", { class: "muted small" }, m.sub)),
      h("span", { class: "blitz-best" }, best ? `🏆 ${best}` : "neu")));
  }
  openSheet(box);
}

export async function runBlitz(view, mode, onExit) {
  const ctx = await loadCtx();
  view.innerHTML = "";
  view.classList.add("feedmode");
  const m = BLITZ_MODES[mode];
  let score = 0, left = SECONDS, timer = null, item = null, locked = false;

  const bar = h("div", {});
  const scoreEl = h("div", { class: "blitz-score" }, "0");
  const prompt = h("div", { class: "blitz-prompt" }, "3");
  const opts = h("div", { class: "blitz-opts" });
  const note = h("div", { class: "muted small blitz-note" });
  const root = h("div", { class: "blitz" },
    h("div", { class: "row" },
      h("button", { class: "back-link", onclick: () => { clearInterval(timer); onExit(); } }, "✕"),
      h("div", { class: "grow progress accent blitz-bar" }, bar),
      scoreEl),
    h("div", { class: "muted small", style: "text-align:center" }, `${m.icon} ${m.title}`),
    prompt, opts, note);
  view.append(root);

  const next = () => {
    item = blitzItem(mode, ctx);
    prompt.textContent = item.prompt;
    opts.innerHTML = "";
    item.opts.forEach((o, i) => opts.append(h("button", {
      class: "blitz-opt" + (mode === "artikel" ? " art art-" + o : ""),
      onclick: () => answer(i),
    }, o)));
    locked = false;
  };

  const answer = (i) => {
    if (locked || left <= 0) return;
    const right = i === item.a;
    root.classList.remove("flash-ok", "flash-bad");
    void root.offsetWidth; // restart the flash animation
    root.classList.add(right ? "flash-ok" : "flash-bad");
    if (right) {
      score++;
      scoreEl.textContent = String(score);
      fx("right");
      note.textContent = "";
      next();
    } else {
      fx("wrong");
      note.textContent = "✗ " + item.why;
      locked = true;
      setTimeout(next, 700); // the pause is the penalty
    }
  };

  const end = () => {
    clearInterval(timer);
    const prev = state.game.best[mode] || 0;
    const record = score > prev;
    if (record) state.game.best[mode] = score;
    save();
    if (score) bumpActivity("blitz", 1, score);
    root.innerHTML = "";
    const xpBtn = h("div", { class: "big-num", style: "color:var(--accent)" }, String(score));
    root.append(h("div", { class: "card", style: "text-align:center;margin-top:30px" },
      h("div", { class: "muted" }, `${m.icon} ${m.title}`),
      xpBtn,
      h("div", { class: "muted" }, record ? "🏆 Neuer Rekord!" : `Rekord: ${prev}`),
      h("div", { class: "row", style: "margin-top:16px" },
        h("button", { class: "btn ghost grow", onclick: onExit }, "Zurück"),
        h("button", { class: "btn grow", onclick: () => runBlitz(view, mode, onExit) }, "Nochmal"))));
    if (score) xpPop(score, xpBtn);
    if (record && prev) celebrate("🏆", "Neuer Rekord!", `${score} statt ${prev} — stark!`);
  };

  // 3-2-1 countdown, then go
  let c = 3;
  const cd = setInterval(() => {
    if (!root.isConnected) return clearInterval(cd);
    c--;
    fx("tick");
    if (c > 0) { prompt.textContent = String(c); return; }
    clearInterval(cd);
    next();
    const t0 = Date.now();
    timer = setInterval(() => {
      if (!root.isConnected) return clearInterval(timer);
      const prevLeft = left;
      left = Math.max(0, SECONDS - (Date.now() - t0) / 1000);
      bar.style.width = (100 * left) / SECONDS + "%";
      if (left <= 10 && Math.ceil(left) !== Math.ceil(prevLeft)) fx("tick");
      if (left <= 0) end();
    }, 100);
  }, 700);
  bar.style.width = "100%";
}
