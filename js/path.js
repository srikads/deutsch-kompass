// Lernpfad: Duolingo-style path of lesson nodes (built from lessons.json).
// Each node runs a short session of mixed exercises; finishing earns XP and
// 1–3 stars and unlocks the next node.

import { state, save, h, loadData, bumpActivity, openSheet, closeSheet, today } from "./core.js";
import { buildPath, pathStatus, sessionXp, stars } from "./game.js";
import { lessonSession } from "./exercises.js";
import { renderExercise } from "./exui.js";
import { renderLesson, TOPIC_DRILL } from "./lernen.js";
import { loadCtx } from "./feed.js";
import { celebrate, xpPop } from "./fx.js";
import { stopTTS } from "./tts.js";

// appends the path map to `view`; `back` re-renders the page that hosts it
export function renderPathMap(view, lessons, back) {
  const units = buildPath(lessons);
  const st = pathStatus(units, state.game.path);
  const all = units.flatMap((u) => u.nodes);
  const done = all.filter((n) => st[n.id] === "done").length;

  view.append(h("h2", { class: "section" }, "🗺️ Lernpfad"),
    h("div", { class: "card", style: "padding-top:10px" },
      h("div", { class: "muted small", style: "margin-bottom:4px" }, `${done} von ${all.length} Stationen geschafft`),
      h("div", { class: "progress accent" }, h("div", { style: `width:${all.length ? (100 * done) / all.length : 0}%` }))));

  let k = 0;
  units.forEach((u, ui) => {
    const uDone = u.nodes.filter((n) => st[n.id] === "done").length;
    view.append(h("div", { class: "unit-head" + (u.free ? " free" : "") },
      h("div", {}, h("div", { class: "small" }, u.free ? "Bonus" : `Einheit ${ui + 1}`), h("b", {}, u.title)),
      h("div", { class: "small" }, `${uDone}/${u.nodes.length}`)));
    const col = h("div", { class: "path-col" });
    for (const n of u.nodes) {
      const s = st[n.id];
      const prog = state.game.path[n.id];
      const icon = s === "done" ? "★".repeat(prog.stars) + "☆".repeat(3 - prog.stars)
        : s === "locked" ? "🔒" : n.kind === "review" ? "🏆" : "▶";
      const node = h("div", { class: "pnode-wrap", style: `transform:translateX(${Math.round(Math.sin(k++ * 0.9) * 70)}px)` },
        h("button", { class: `pnode ${s} ${n.kind}`, onclick: () => openNode(view, n, s, lessons, back) },
          h("span", { class: "pnode-ico" }, icon)),
        h("div", { class: "pnode-lbl" }, n.title));
      col.append(node);
      if (s === "current") setTimeout(() => node.scrollIntoView?.({ block: "center" }), 50);
    }
    view.append(col);
  });
}

function openNode(view, node, status, lessons, back) {
  const ls = lessons.filter((l) => node.lessonIds.includes(l.id));
  const prog = state.game.path[node.id];
  const box = h("div", {},
    h("div", { class: "word" }, node.kind === "review" ? "🏆 " : "", node.title),
    h("div", { class: "muted small", style: "margin:4px 0 12px" },
      prog ? `Bestes Ergebnis: ${"★".repeat(prog.stars)}` :
      status === "locked" ? "🔒 Noch gesperrt — du kannst aber schon üben." : "8 Übungen · ca. 3 Min"));
  box.append(h("button", {
    class: "btn", style: "width:100%",
    onclick: () => { closeSheet(); runSession(view, node, ls, back); },
  }, prog ? "Nochmal üben" : "Los geht's! · +20 XP"));
  if (node.kind === "lesson" && ls[0]) {
    box.append(h("button", {
      class: "btn ghost", style: "width:100%;margin-top:8px",
      onclick: () => { closeSheet(); renderLesson(view, ls[0], back, null); },
    }, "📖 Erst die Regel lesen"));
  }
  openSheet(box);
}

export async function runSession(view, node, ls, back) {
  const [ctx, drills] = await Promise.all([loadCtx(), loadData("drills")]);
  const drillIds = [...new Set(ls.map((l) => TOPIC_DRILL[l.topic]).filter(Boolean))];
  const drill = drills.find((d) => drillIds.includes(d.id));
  const queue = lessonSession(ls, drill, ctx, Math.random, node.kind === "review" ? 10 : 8);
  const total = queue.length;
  let right = 0, pos = 0;
  const retried = new Set();

  view.innerHTML = "";
  view.scrollTop = 0;
  view.classList.add("feedmode");
  const bar = h("div", { style: "width:0%" });
  const stage = h("div", { class: "session-stage" });
  view.append(
    h("div", { class: "session-top" },
      h("button", { class: "back-link", onclick: () => { stopTTS(); back(); } }, "✕"),
      h("div", { class: "grow progress green" }, bar)),
    stage);

  const show = () => {
    if (pos >= queue.length) return finish();
    const ex = queue[pos];
    const el = renderExercise(ex, {
      onResult: (ok) => {
        if (ok && !retried.has(ex)) right++;
        if (!ok && !retried.has(ex)) { retried.add(ex); queue.push(ex); } // one more try at the end
        bar.style.width = (100 * Math.min(pos + 1, total)) / total + "%";
      },
      onNext: () => { pos++; show(); },
    });
    stage.innerHTML = "";
    stage.append(h("div", { class: "fcard-in t" + (pos % 6) }, el));
    el.show();
  };

  const finish = () => {
    const xp = sessionXp(right, total);
    const s = stars(right, total);
    const prev = state.game.path[node.id];
    state.game.path[node.id] = { stars: Math.max(s, prev?.stars || 0), date: today() };
    save();
    bumpActivity("path", 1, xp);
    stage.innerHTML = "";
    const big = h("div", { class: "big-num", style: "color:var(--accent)" }, `+${xp} XP`);
    stage.append(h("div", { class: "card", style: "text-align:center;margin-top:20px" },
      h("div", { class: "stars" }, ...[1, 2, 3].map((i) => h("span", { class: i <= s ? "on" : "" }, "★"))),
      h("div", { class: "reader-title" }, right === total ? "Perfekt!" : s >= 2 ? "Gut gemacht!" : "Geschafft!"),
      h("div", { class: "muted" }, `${right} von ${total} beim ersten Versuch richtig`),
      big,
      h("button", { class: "btn green", style: "width:100%;margin-top:14px", onclick: back }, "Weiter")));
    xpPop(xp, big);
    if (!prev) celebrate(s === 3 ? "🌟" : "🎯", "Station geschafft!", node.title);
  };
  show();
}
