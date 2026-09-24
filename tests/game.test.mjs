import { test } from "node:test";
import assert from "node:assert/strict";
import {
  XP, newGame, levelFloor, levelInfo, addXp, registerAnswer, sessionXp, stars,
  addDays, streakLen, applyFreezes, maybeEarnFreeze, buildPath, pathStatus,
} from "../js/game.js";

test("level curve: 100, 300, 600 … XP", () => {
  assert.equal(levelFloor(1), 0);
  assert.equal(levelFloor(2), 100);
  assert.equal(levelFloor(3), 300);
  assert.equal(levelInfo(0).level, 1);
  assert.equal(levelInfo(99).level, 1);
  assert.equal(levelInfo(100).level, 2);
  const l = levelInfo(350);
  assert.deepEqual([l.level, l.into, l.span], [3, 50, 300]);
  assert.equal(levelInfo(1e6).title, "Deutschmeister"); // titles cap out
});

test("addXp tracks daily totals, level-ups and the goal crossing once", () => {
  const g = newGame();
  let r = addXp(g, 60, "2026-09-24", 100);
  assert.equal(r.goalReached, false);
  assert.equal(r.leveledUp, false);
  r = addXp(g, 50, "2026-09-24", 100);
  assert.equal(r.goalReached, true);
  assert.equal(r.leveledUp, true);
  assert.equal(g.daily["2026-09-24"], 110);
  assert.equal(g.goalHit["2026-09-24"], true);
  r = addXp(g, 10, "2026-09-24", 100);
  assert.equal(r.goalReached, false, "goal celebrates only once per day");
  addXp(g, 5, "2026-09-25", 100);
  assert.equal(g.daily["2026-09-25"], 5);
  assert.equal(g.xp, 125);
});

test("combo: base XP, bonus every 5th, reset on a miss", () => {
  const g = newGame();
  const xs = [1, 2, 3, 4, 5].map(() => registerAnswer(g, true));
  assert.deepEqual(xs.map((x) => x.xp), [5, 5, 5, 5, 5 + XP.comboBonus]);
  assert.equal(xs[4].bonus, true);
  const miss = registerAnswer(g, false);
  assert.deepEqual([miss.xp, g.combo, g.bestCombo], [0, 0, 5]);
});

test("session XP and stars", () => {
  assert.equal(sessionXp(8, 8), XP.pathBase + 16 + XP.pathPerfect);
  assert.equal(sessionXp(4, 8), XP.pathBase + 8);
  assert.equal(stars(8, 8), 3);
  assert.equal(stars(6, 8), 2);
  assert.equal(stars(2, 8), 1);
  assert.equal(stars(0, 0), 1);
});

test("addDays crosses month boundaries in UTC", () => {
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("streak counts back from today, or from yesterday if today is empty", () => {
  const act = { "2026-09-22": {}, "2026-09-23": {}, "2026-09-24": {} };
  assert.equal(streakLen(act, {}, "2026-09-24"), 3);
  assert.equal(streakLen(act, {}, "2026-09-25"), 3, "today not done yet keeps the streak");
  assert.equal(streakLen(act, {}, "2026-09-26"), 0, "a full missed day breaks it");
});

test("frozen days bridge a gap without counting", () => {
  const act = { "2026-09-20": {}, "2026-09-21": {}, "2026-09-23": {} };
  assert.equal(streakLen(act, { "2026-09-22": true }, "2026-09-23"), 3);
});

test("applyFreezes spends freezes only when they cover the whole gap", () => {
  const act = { "2026-09-20": {}, "2026-09-21": {} };
  const g = newGame();
  g.freezes = 1;
  // missed 22 and 23 (today is 24) -> 2 days, only 1 freeze: nothing spent
  assert.equal(applyFreezes(g, act, "2026-09-24"), 0);
  assert.equal(g.freezes, 1);
  // missed only the 22nd (today 23)
  assert.equal(applyFreezes(g, act, "2026-09-23"), 1);
  assert.equal(g.freezes, 0);
  assert.equal(g.frozen["2026-09-22"], true);
  assert.equal(streakLen(act, g.frozen, "2026-09-23"), 2);
  // no gap -> nothing to do
  const g2 = newGame(); g2.freezes = 2;
  assert.equal(applyFreezes(g2, { "2026-09-23": {} }, "2026-09-24"), 0);
  // no previous streak at all -> don't waste freezes
  assert.equal(applyFreezes(g2, {}, "2026-09-24"), 0);
  assert.equal(g2.freezes, 2);
});

test("freezes are earned on 7-day milestones, max 2", () => {
  const g = newGame();
  assert.equal(maybeEarnFreeze(g, 6), false);
  assert.equal(maybeEarnFreeze(g, 7), true);
  assert.equal(maybeEarnFreeze(g, 14), true);
  assert.equal(maybeEarnFreeze(g, 21), false);
  assert.equal(g.freezes, 2);
});

const LESSONS = [
  { id: "a", level: "B1", topic: "Konjunktiv", title: "K2" },
  { id: "b", level: "B1", topic: "Verben & Zeiten", title: "Perfekt" },
  { id: "c", level: "B1", topic: "Verben & Zeiten", title: "Präteritum" },
  { id: "d", level: "A2", topic: "Fälle", title: "Dativ" },
];

test("buildPath: B1 units in topic order with unit tests, A-levels as free bonus unit", () => {
  const units = buildPath(LESSONS);
  assert.deepEqual(units.map((u) => u.title), ["Verben & Zeiten", "Konjunktiv", "Wiederholung A1/A2"]);
  assert.deepEqual(units[0].nodes.map((n) => n.kind), ["lesson", "lesson", "review"]);
  assert.deepEqual(units[0].nodes[2].lessonIds, ["b", "c"]);
  assert.equal(units[1].nodes.length, 1, "single-lesson unit gets no unit test");
  assert.equal(units[2].free, true);
  const ids = units.flatMap((u) => u.nodes.map((n) => n.id));
  assert.equal(new Set(ids).size, ids.length, "node ids are unique");
});

test("pathStatus: exactly one current node, rest locked; free unit always open", () => {
  const units = buildPath(LESSONS);
  let st = pathStatus(units, {});
  assert.deepEqual(Object.values(st).filter((s) => s === "current").length, 1);
  assert.equal(st["l-b"], "current");
  assert.equal(st["l-c"], "locked");
  assert.equal(st["l-d"], "open");
  st = pathStatus(units, { "l-b": { stars: 2 } });
  assert.equal(st["l-b"], "done");
  assert.equal(st["l-c"], "current");
});
