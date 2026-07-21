// Library view (essay list with filters + read-checklist) and the Reader
// with tap-to-translate, DW native audio, and TTS with highlighting.

import { state, save, h, loadData, openSheet, closeSheet, toast, bumpActivity, today, esc } from "./core.js";
import { lookup } from "./dict.js";
import { speak, stopTTS, isSpeaking, ttsSupported } from "./tts.js";
import { addCard } from "./vocab.js";

const filters = { level: "alle", topic: "alle", q: "", unread: false };

export async function renderLibrary(view) {
  const essays = await loadData("essays");
  view.innerHTML = "";

  const readCount = essays.filter((e) => state.essaysRead[e.id]).length;
  view.append(
    h("div", { class: "card" },
      h("div", { class: "row" },
        h("div", { class: "grow" },
          h("h3", {}, "Lese-Checkliste"),
          h("div", { class: "muted" }, `${readCount} von ${essays.length} Essays gelesen`)),
        h("div", { class: "big-num" }, String(Math.round((100 * readCount) / essays.length)) + "%")),
      h("div", { class: "progress", style: "margin-top:8px" },
        h("div", { style: `width:${(100 * readCount) / essays.length}%` }))
    )
  );

  const topics = ["alle", ...new Set(essays.map((e) => e.topic))];
  const levels = ["alle", ...new Set(essays.map((e) => e.level))];

  const chipRow = (items, key) =>
    h("div", { class: "chips" },
      ...items.map((it) =>
        h("button", {
          class: "chip" + (filters[key] === it ? " active" : ""),
          onclick: () => { filters[key] = it; renderLibrary(view); },
        }, it === "alle" ? "Alle" : it)
      ),
      key === "topic"
        ? h("button", {
            class: "chip" + (filters.unread ? " active" : ""),
            onclick: () => { filters.unread = !filters.unread; renderLibrary(view); },
          }, "Ungelesen")
        : null
    );

  view.append(chipRow(levels, "level"), chipRow(topics, "topic"));

  const search = h("input", {
    type: "search", placeholder: "Suchen…", value: filters.q,
    oninput: (e) => { filters.q = e.target.value; list.replaceWith(makeList()); },
  });
  view.append(search);

  const makeList = () => {
    const q = filters.q.toLowerCase();
    const shown = essays.filter((e) =>
      (filters.level === "alle" || e.level === filters.level) &&
      (filters.topic === "alle" || e.topic === filters.topic) &&
      (!filters.unread || !state.essaysRead[e.id]) &&
      (!q || e.title.toLowerCase().includes(q) || e.teaser.toLowerCase().includes(q))
    );
    const wrap = h("div", { class: "card" });
    if (!shown.length) wrap.append(h("div", { class: "muted" }, "Keine Essays gefunden."));
    for (const e of shown) {
      wrap.append(
        h("div", {
          class: "essay-item" + (state.essaysRead[e.id] ? " read" : ""),
          onclick: () => renderReader(view, e),
        },
          h("span", { class: "readmark" }, "✓"),
          h("div", { class: "grow" },
            h("div", { class: "tt" }, e.title),
            h("div", { class: "meta" }, `${e.topic} · ${e.words} Wörter · ${Math.max(1, Math.round(e.words / 140))} Min · ${e.date}`)),
          h("span", { class: "lvl " + e.level }, e.level))
      );
    }
    return wrap;
  };
  let list = makeList();
  view.append(list);
}

export async function renderReader(view, essay) {
  stopTTS();
  view.innerHTML = "";
  view.scrollTop = 0;

  view.append(
    h("button", { class: "back-link", onclick: () => { stopTTS(); renderLibrary(view); } }, "‹ Bibliothek")
  );

  // --- audio bar -------------------------------------------------------
  const bar = h("div", { class: "audiobar" });
  if (essay.audioUrl) {
    bar.append(h("audio", { controls: true, preload: "none", src: essay.audioUrl }));
  }
  const spans = [];
  let ttsBtn;
  if (ttsSupported()) {
    ttsBtn = h("button", {
      class: "btn soft sm", style: "margin-top:6px",
      onclick: () => {
        if (isSpeaking()) { stopTTS(); ttsBtn.textContent = "▶ Vorlesen mit Hervorhebung"; }
        else {
          speak(spans, { rate: 0.88, onEnd: () => (ttsBtn.textContent = "▶ Vorlesen mit Hervorhebung") });
          ttsBtn.textContent = "■ Stopp";
        }
      },
    }, "▶ Vorlesen mit Hervorhebung");
    bar.append(ttsBtn);
  }
  view.append(bar);

  // --- title & meta ----------------------------------------------------
  view.append(
    h("div", { class: "reader-title" }, essay.title),
    h("div", { class: "muted small" }, `${essay.source} · ${essay.level} · ${essay.date} · `,
      h("a", { href: essay.url, target: "_blank", style: "color:var(--blue)" }, "Original"))
  );

  // --- text, word-by-word ---------------------------------------------
  const textEl = h("div", { class: "reader-text", style: "margin-top:10px" });
  const paras = essay.text.split(/\n\n+/);
  for (const para of paras) {
    const p = h("p");
    const words = para.split(/\s+/).filter(Boolean);
    words.forEach((wd, i) => {
      const sp = h("span", { class: "w" }, wd);
      if (i === words.length - 1) sp.dataset.paraEnd = "1";
      sp.addEventListener("click", () => showWordSheet(wd, essay, sp));
      spans.push(sp);
      p.append(sp, " ");
    });
    textEl.append(p);
  }
  view.append(textEl);

  // --- glossary --------------------------------------------------------
  if (essay.glossary?.length) {
    const g = h("div", { class: "card" }, h("h3", {}, "Glossar (DW)"));
    for (const it of essay.glossary) {
      g.append(h("div", { class: "small", style: "padding:4px 0" },
        h("b", {}, it.term), " — ", it.def));
    }
    view.append(g);
  }

  // --- mark as read ----------------------------------------------------
  const done = !!state.essaysRead[essay.id];
  const btn = h("button", { class: "btn " + (done ? "ghost" : "green"), style: "width:100%;margin:12px 0" },
    done ? "✓ Gelesen — Markierung entfernen" : "✓ Als gelesen markieren");
  btn.onclick = () => {
    if (state.essaysRead[essay.id]) {
      delete state.essaysRead[essay.id];
    } else {
      state.essaysRead[essay.id] = today();
      bumpActivity("essays");
      toast("Essay abgehakt! 🎉");
    }
    save();
    renderReader(view, essay);
  };
  view.append(btn);
}

// --- tap-to-translate bottom sheet ------------------------------------

async function showWordSheet(word, essay, spanEl) {
  const box = h("div", {},
    h("div", { class: "word" }, word.replace(/^[^A-Za-zÄÖÜäöüß]+|[^A-Za-zÄÖÜäöüß]+$/g, "")),
    h("div", { class: "muted small", style: "margin-top:6px" }, "Suche…"));
  openSheet(box);

  const res = await lookup(word, essay);
  if (!res) return;
  box.innerHTML = "";

  box.append(h("div", {},
    h("span", { class: "word" }, res.word),
    res.b1 ? h("span", { class: "tag" }, "B1-Wortliste") : null));

  if (res.grammar && res.grammar !== res.word)
    box.append(h("div", { class: "muted", style: "margin-top:4px" }, res.grammar));
  if (res.verbForms)
    box.append(h("div", { class: "muted small" }, res.verbForms));

  if (res.translation)
    box.append(h("div", { class: "def" }, h("b", {}, "EN: "), res.translation));
  if (res.gloss)
    box.append(h("div", { class: "def" }, h("b", {}, "DE: "), res.gloss));

  if (res.wiktionary) {
    for (const sec of res.wiktionary.slice(0, 2)) {
      box.append(h("div", { class: "small muted", style: "margin-top:6px" },
        h("b", {}, sec.pos + ": "), sec.defs.join(" · ")));
    }
  }
  if (!res.translation && !res.gloss && !res.wiktionary) {
    box.append(h("div", { class: "def muted" },
      navigator.onLine ? "Keine Übersetzung gefunden." : "Offline — keine Übersetzung im Cache."));
  }

  const back = res.translation || res.gloss || res.wiktionary?.[0]?.defs?.[0] || "";
  box.append(
    h("div", { class: "row", style: "margin-top:14px" },
      h("button", {
        class: "btn grow",
        onclick: () => {
          addCard(res.word, {
            back,
            grammar: res.grammar,
            verbForms: res.verbForms,
            b1: res.b1,
            source: essay?.title || "",
          });
          spanEl?.classList.add("saved");
          toast("Zur Lernkartei hinzugefügt");
          closeSheet();
        },
      }, "＋ Lernkarte"),
      h("button", {
        class: "btn ghost",
        onclick: () => speechSynthesis && speak([spanEl || fakeSpan(res.word)], { rate: 0.8 }),
      }, "🔊"),
      h("button", { class: "btn ghost", onclick: closeSheet }, "Schließen"))
  );
}

function fakeSpan(word) {
  const s = document.createElement("span");
  s.textContent = word;
  return s;
}
