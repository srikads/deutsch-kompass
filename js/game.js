// Gamification core: XP, levels, daily goal, combos, streak freezes and the
// learning-path model. Pure functions over plain objects (no DOM, no storage)
// so everything here is unit-tested in tests/game.test.mjs.

export const XP = {
  feedRight: 5,     // correct answer in the feed
  comboEvery: 5,    // every Nth correct answer in a row ...
  comboBonus: 5,    // ... earns this bonus
  pathBase: 20,     // finishing a path session
  pathPerfect: 10,  // bonus for no mistakes
  // classic activities (keyed like state.activity fields)
  reviews: 2, essays: 30, drills: 15, lesen: 25, schreiben: 40, newCards: 3, lessons: 15,
};

export function newGame() {
  return {
    xp: 0,          // lifetime XP
    daily: {},      // ISO date -> XP earned that day
    goalHit: {},    // ISO date -> true once the daily goal was reached
    combo: 0, bestCombo: 0,
    best: {},       // blitz mode -> high score
    freezes: 0,     // streak freezes in stock (max 2)
    frozen: {},     // ISO date -> true (day covered by a freeze)
    path: {},       // path node id -> { stars, date }
  };
}

// ---- levels -------------------------------------------------------------

const TITLES = [
  "Neuling", "Entdecker", "Wortsammler", "Satzbauer", "Grammatikfuchs",
  "Plaudertasche", "Leseratte", "Sprachprofi", "B1-Held", "Deutschmeister",
];

// total XP needed to reach a level: L2 = 100, L3 = 300, L4 = 600, L5 = 1000 …
export const levelFloor = (lvl) => 50 * (lvl - 1) * lvl;

export function levelInfo(xp) {
  let level = 1;
  while (levelFloor(level + 1) <= xp) level++;
  const floor = levelFloor(level);
  return {
    level,
    into: xp - floor,
    span: levelFloor(level + 1) - floor,
    title: TITLES[Math.min(level, TITLES.length) - 1],
  };
}

export function addXp(game, amount, day, goal) {
  const before = levelInfo(game.xp).level;
  const dayBefore = game.daily[day] || 0;
  game.xp += amount;
  game.daily[day] = dayBefore + amount;
  const after = levelInfo(game.xp).level;
  const goalReached = dayBefore < goal && game.daily[day] >= goal;
  if (goalReached) game.goalHit[day] = true;
  return { gained: amount, level: after, leveledUp: after > before, goalReached };
}

// feed/session answer -> XP incl. combo bonus
export function registerAnswer(game, right) {
  if (!right) {
    game.combo = 0;
    return { xp: 0, combo: 0, bonus: false };
  }
  game.combo++;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  const bonus = game.combo % XP.comboEvery === 0;
  return { xp: XP.feedRight + (bonus ? XP.comboBonus : 0), combo: game.combo, bonus };
}

export function sessionXp(right, total) {
  return XP.pathBase + right * 2 + (right === total ? XP.pathPerfect : 0);
}

export function stars(right, total) {
  const acc = total ? right / total : 0;
  return acc >= 0.9 ? 3 : acc >= 0.7 ? 2 : 1;
}

// ---- streak + freezes -----------------------------------------------------

export function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// consecutive active days ending today (or yesterday, if today has nothing
// yet). Frozen days bridge a gap but don't add to the count.
export function streakLen(active, frozen, day) {
  const on = (d) => active[d] || frozen[d];
  let d = on(day) ? day : addDays(day, -1);
  let n = 0;
  while (on(d)) {
    if (active[d]) n++;
    d = addDays(d, -1);
  }
  return n;
}

// Called on app start: if the days since the last active day can be covered
// by freezes in stock, spend them so the streak survives. Returns days used.
export function applyFreezes(game, active, day) {
  const on = (d) => active[d] || game.frozen[d];
  const gap = [];
  let d = addDays(day, -1);
  while (!on(d) && gap.length < 10) {
    gap.push(d);
    d = addDays(d, -1);
  }
  if (!gap.length || !on(d) || gap.length > game.freezes) return 0;
  for (const g of gap) game.frozen[g] = true;
  game.freezes -= gap.length;
  return gap.length;
}

// Earn a freeze each time the goal is reached on a 7-day milestone.
export function maybeEarnFreeze(game, streak) {
  if (streak > 0 && streak % 7 === 0 && game.freezes < 2) {
    game.freezes++;
    return true;
  }
  return false;
}

// ---- learning path ------------------------------------------------------

const TOPIC_ORDER = [
  "Verben & Zeiten", "Satzbau & Konnektoren", "Fälle", "Präpositionen",
  "Relativsätze", "Konjunktiv", "Adjektive", "Pronomen", "Wortschatz",
];

// B1 lessons become sequential units (one per topic, ending in a unit test);
// A1/A2 lessons form an always-open review unit at the end.
export function buildPath(lessons) {
  const rank = (t) => (TOPIC_ORDER.includes(t) ? TOPIC_ORDER.indexOf(t) : TOPIC_ORDER.length);
  const b1 = lessons.filter((l) => l.level === "B1" || l.level === "B2");
  const topics = [...new Set(b1.map((l) => l.topic))].sort((a, b) => rank(a) - rank(b));
  const units = topics.map((topic, ui) => {
    const ls = b1.filter((l) => l.topic === topic);
    const nodes = ls.map((l) => ({ id: "l-" + l.id, kind: "lesson", title: l.title, lessonIds: [l.id] }));
    if (ls.length > 1)
      nodes.push({ id: "u-" + ui, kind: "review", title: `Unit-Test: ${topic}`, lessonIds: ls.map((l) => l.id) });
    return { title: topic, free: false, nodes };
  });
  const easy = lessons.filter((l) => l.level === "A1" || l.level === "A2");
  if (easy.length)
    units.push({
      title: "Wiederholung A1/A2", free: true,
      nodes: easy.map((l) => ({ id: "l-" + l.id, kind: "lesson", title: l.title, lessonIds: [l.id] })),
    });
  return units;
}

// node id -> "done" | "current" | "open" | "locked"
export function pathStatus(units, progress) {
  const status = {};
  let currentGiven = false;
  for (const u of units) {
    for (const n of u.nodes) {
      if (progress[n.id]) status[n.id] = "done";
      else if (u.free) status[n.id] = "open";
      else if (!currentGiven) { status[n.id] = "current"; currentGiven = true; }
      else status[n.id] = "locked";
    }
  }
  return status;
}
