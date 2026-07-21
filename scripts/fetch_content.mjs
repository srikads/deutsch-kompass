// Fetches real leveled German learner content from Deutsche Welle RSS feeds
// and bundles it into data/essays.json for the PWA.
//
// Usage:
//   node scripts/fetch_content.mjs            # fetch all sources
//   node scripts/fetch_content.mjs --inspect <lessonUrl>   # dump object shapes for one lesson
//
// Re-run any time to refresh content. Existing essay ids are kept stable
// (id = DW content id), so reading progress in the app survives refreshes.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "essays.json");

const SOURCES = [
  {
    name: "DW Top-Thema",
    feed: "https://rss.dw.com/xml/DKpodcast_topthemamitvokabeln_de",
    level: "B1",
    max: 40,
  },
  {
    name: "DW Video-Thema",
    feed: "https://rss.dw.com/xml/DKpodcast_videothema_de",
    level: "B2",
    max: 20,
  },
  {
    name: "DW Nachrichten (langsam)",
    feed: "https://rss.dw.com/xml/DKpodcast_lgn_de",
    level: "B2",
    max: 10,
  },
];

const UA = { headers: { "user-agent": "Mozilla/5.0 (personal learning app content fetcher)" } };

const NAMED_ENTITIES = {
  lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", amp: "&",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", bdquo: "„", eacute: "é", egrave: "è",
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(\w+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

function stripHtml(html) {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseRss(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const tag = (name) => {
      const r = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`).exec(block);
      return r ? decodeEntities(r[1].trim()) : "";
    };
    const enc = /<enclosure[^>]*url="([^"]+)"/.exec(block);
    items.push({
      guid: tag("guid"),
      title: tag("title"),
      link: tag("link").split("?")[0],
      pubDate: tag("pubDate"),
      description: tag("description"),
      keywords: tag("itunes:keywords"),
      audioUrl: enc ? enc[1] : "",
    });
  }
  return items;
}

function extractApolloState(html) {
  const marker = "window.__APOLLO_STATE__=";
  const i = html.indexOf(marker);
  if (i < 0) return null;
  let s = html.slice(i + marker.length);
  const end = s.indexOf("</script>");
  if (end >= 0) s = s.slice(0, end);
  s = s.trim().replace(/;$/, "");
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Pull article text, glossary and exercises out of the Apollo cache blob.
function extractLesson(state) {
  let bestText = "";
  let teaser = "";
  for (const [key, obj] of Object.entries(state)) {
    if (!obj || typeof obj !== "object") continue;
    const raw = obj.manuscript || obj.text;
    if ((key.startsWith("Lesson:") || key.startsWith("Article:")) && typeof raw === "string") {
      const t = stripHtml(raw);
      if (t.length > bestText.length) {
        bestText = t;
        teaser = stripHtml(obj.teaser || obj.description || "");
      }
    }
  }
  const glossary = [];
  for (const [key, obj] of Object.entries(state)) {
    if (key.startsWith("Knowledge:") && obj?.knowledgeType === "GLOSSARY") {
      const term = (obj.shortTitle || obj.name || "").trim();
      const def = stripHtml(obj.text || "");
      if (term && def) glossary.push({ term, def });
    }
  }
  return { text: bestText, teaser, glossary };
}

function guessTopic(keywords, title) {
  const s = (keywords + " " + title).toLowerCase();
  const rules = [
    ["Wissenschaft & Technik", /technik|wissenschaft|forschung|digital|ki\b|internet|energie|klima|umwelt|medizin|krankheit|gesundheit/],
    ["Kultur & Geschichte", /kultur|geschichte|musik|kunst|film|literatur|museum|tradition|religion/],
    ["Politik & Gesellschaft", /politik|regierung|wahl|gesellschaft|migration|krieg|eu\b|gesetz|protest/],
    ["Reisen & Geografie", /reise|tourismus|stadt|land\b|geografie|urlaub|berge|meer/],
    ["Sport", /sport|fußball|olympia|verein/],
    ["Wirtschaft & Arbeit", /wirtschaft|arbeit|geld|unternehmen|beruf|industrie|preis/],
  ];
  for (const [topic, re] of rules) if (re.test(s)) return topic;
  return "Alltag & Leben";
}

async function fetchLessonPage(url) {
  const res = await fetch(encodeURI(url), UA);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function inspect(url) {
  const html = await fetchLessonPage(url);
  const state = extractApolloState(html);
  if (!state) return console.log("No APOLLO_STATE found");
  for (const [key, obj] of Object.entries(state)) {
    if (/^(Article|Lesson|Exercise)/.test(key)) {
      console.log("=== " + key + " keys: " + Object.keys(obj).join(", "));
      if (key.startsWith("Exercise")) console.log(JSON.stringify(obj).slice(0, 1500));
    }
  }
}

async function main() {
  if (process.argv[2] === "--inspect") return inspect(process.argv[3]);

  // Keep previously fetched essays so the library only ever grows.
  let existing = [];
  if (existsSync(OUT)) {
    try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch {}
  }
  const byId = new Map(existing.map((e) => [e.id, e]));

  const summary = [];
  for (const src of SOURCES) {
    let ok = 0, fail = 0, skipped = 0;
    try {
      const xml = await (await fetch(src.feed, UA)).text();
      const items = parseRss(xml).slice(0, src.max);
      for (const item of items) {
        const id = "dw-" + (item.guid || item.link.split("/l-").pop());
        if (byId.has(id)) { skipped++; continue; }
        try {
          const html = await fetchLessonPage(item.link);
          const state = extractApolloState(html);
          if (!state) throw new Error("no apollo state");
          const { text, teaser, glossary } = extractLesson(state);
          if (text.length < 300) throw new Error("text too short: " + text.length);
          byId.set(id, {
            id,
            source: src.name,
            url: item.link,
            title: item.title,
            level: src.level,
            topic: guessTopic(item.keywords, item.title),
            date: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : "",
            teaser: teaser || item.description,
            text,
            glossary,
            audioUrl: item.audioUrl,
            words: text.split(/\s+/).length,
          });
          ok++;
        } catch (e) {
          fail++;
          console.log(`  FAIL ${item.link} (${e.message})`);
        }
        await new Promise((r) => setTimeout(r, 300)); // be polite to DW
      }
    } catch (e) {
      console.log(`FEED FAIL ${src.name}: ${e.message}`);
    }
    summary.push(`${src.name}: +${ok} new, ${skipped} kept, ${fail} failed`);
  }

  const essays = [...byId.values()].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(essays, null, 1), "utf8");
  console.log(summary.join("\n"));
  console.log(`Total essays: ${essays.length} -> ${OUT}`);
  const perLevel = {};
  for (const e of essays) perLevel[e.level] = (perLevel[e.level] || 0) + 1;
  console.log("Per level: " + JSON.stringify(perLevel));
}

main().catch((e) => { console.error(e); process.exit(1); });
