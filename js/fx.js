// Feedback effects: synthesized sounds (Web Audio, no files), vibration,
// confetti, floating "+XP" and full-screen celebrations.

import { h, soundOn } from "./core.js";

let ctx = null;
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, start, dur, type = "sine", vol = 0.18) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const SOUNDS = {
  right: () => { tone(660, 0, 0.12); tone(990, 0.09, 0.2); },
  wrong: () => { tone(180, 0, 0.22, "square", 0.08); tone(150, 0.12, 0.25, "square", 0.08); },
  tap: () => tone(520, 0, 0.05, "triangle", 0.08),
  combo: () => [660, 830, 990, 1320].forEach((f, i) => tone(f, i * 0.06, 0.14)),
  level: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.3, "triangle")),
  tick: () => tone(1200, 0, 0.03, "square", 0.04),
};
const BUZZ = { right: 25, wrong: [60, 40, 60], combo: [20, 30, 20, 30, 40], level: [40, 60, 40, 60, 120] };

export function fx(kind) {
  if (soundOn()) try { SOUNDS[kind]?.(); } catch {}
  if (BUZZ[kind] && navigator.vibrate) navigator.vibrate(BUZZ[kind]);
}

export function confetti(n = 70) {
  const colors = ["#cc4b1f", "#ffd54d", "#2c7a4b", "#2b5f8a", "#e86a3c", "#1c1c1c"];
  const layer = h("div", { class: "confetti" });
  for (let i = 0; i < n; i++) {
    const p = h("i");
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.4 + "s";
    p.style.animationDuration = 1.4 + Math.random() * 1.2 + "s";
    p.style.setProperty("--dx", (Math.random() * 2 - 1) * 120 + "px");
    p.style.setProperty("--rot", Math.random() * 720 + "deg");
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3200);
}

// floating "+5 XP" near an element (or screen centre)
export function xpPop(amount, anchor) {
  const r = anchor?.getBoundingClientRect?.();
  const el = h("div", { class: "xp-pop" }, `+${amount} XP`);
  el.style.left = (r ? r.left + r.width / 2 : window.innerWidth / 2) + "px";
  el.style.top = (r ? r.top : window.innerHeight / 2) + "px";
  document.body.append(el);
  setTimeout(() => el.remove(), 1100);
}

// full-screen celebration card (level up, goal reached …)
export function celebrate(emoji, title, sub) {
  fx("level");
  confetti();
  const box = h("div", { class: "celebrate", onclick: () => box.remove() },
    h("div", { class: "celebrate-card" },
      h("div", { class: "celebrate-emoji" }, emoji),
      h("div", { class: "celebrate-title" }, title),
      h("div", { class: "muted" }, sub),
      h("button", { class: "btn", style: "margin-top:16px;width:100%" }, "Weiter")));
  document.body.append(box);
}
