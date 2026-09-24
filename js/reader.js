// Library view (essay list with filters + read-checklist) and the Reader
// with tap-to-translate, DW native audio, and TTS with highlighting.

import { state, save, h, loadData, openSheet, closeSheet, toast, bumpActivity, today, esc } from "./core.js";
import { lookup } from "./dict.js";
import { speak, stopTTS, isSpeaking, ttsSupported } from "./tts.js";
import { addCard } from "./vocab.js";
import { openTutor } from "./tutor.js";

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

// the essay mp3 lives outside the DOM, so it must be stopped explicitly
// when leaving the reader (tab switch, back link)
let activeAudio = null;
export function stopReaderAudio() {
  activeAudio?.pause();
  activeAudio = null;
  stopTTS();
}

const fmtTime = (t) => (isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` : "0:00");

export async function renderReader(view, essay) {
  stopReaderAudio();
  view.innerHTML = "";
  view.scrollTop = 0;

  view.append(
    h("button", { class: "back-link", onclick: () => { stopReaderAudio(); renderLibrary(view); } }, "‹ Bibliothek")
  );

  // --- bottom player -----------------------------------------------------
  // Fixed above the tab bar, far from the back link (it used to sit right
  // under it at the top, so taps on ▶ kept hitting "‹ Bibliothek").
  const spans = [];
  const audioEl = essay.audioUrl ? new Audio() : null;
  if (audioEl) { audioEl.preload = "none"; audioEl.src = essay.audioUrl; activeAudio = audioEl; }

  const SPEEDS = [1, 0.85, 0.75, 1.15];
  let speedIdx = 0;
  let ttsRate = 0.88;
  const playBtn = h("button", { class: "pl-play", "aria-label": "Abspielen / Pause" }, "▶");
  const speedBtn = h("button", { class: "pl-sm", "aria-label": "Tempo" }, "1×");
  const setIcon = (playing) => (playBtn.textContent = playing ? "❚❚" : "▶");
  const ttsLabel = "🗣 Vorlesen";
  let ttsBtn = null;

  const startTTS = (btn) => {
    audioEl?.pause();
    speak(spans, { rate: ttsRate, onEnd: () => { if (btn) btn.textContent = ttsLabel; else setIcon(false); } });
    if (btn) btn.textContent = "■ Stopp"; else setIcon(true);
  };

  const player = h("div", { class: "player" });
  if (audioEl) {
    const seek = h("input", { type: "range", min: 0, max: 1000, value: 0, class: "pl-seek", "aria-label": "Position" });
    const time = h("span", { class: "pl-time" }, "0:00 / –");
    let dragging = false;
    audioEl.addEventListener("play", () => setIcon(true));
    audioEl.addEventListener("pause", () => setIcon(false));
    audioEl.addEventListener("ended", () => setIcon(false));
    audioEl.addEventListener("timeupdate", () => {
      const d = audioEl.duration;
      if (!dragging && d) seek.value = String(Math.round((audioEl.currentTime / d) * 1000));
      time.textContent = `${fmtTime(audioEl.currentTime)} / ${d ? fmtTime(d) : "–"}`;
    });
    seek.addEventListener("input", () => (dragging = true));
    seek.addEventListener("change", () => {
      dragging = false;
      if (audioEl.duration) audioEl.currentTime = (Number(seek.value) / 1000) * audioEl.duration;
    });
    playBtn.onclick = () => {
      if (isSpeaking()) { stopTTS(); if (ttsBtn) ttsBtn.textContent = ttsLabel; }
      if (audioEl.paused) audioEl.play().catch(() => toast("Audio nicht verfügbar (offline?)"));
      else audioEl.pause();
    };
    speedBtn.onclick = () => {
      speedIdx = (speedIdx + 1) % SPEEDS.length;
      audioEl.playbackRate = SPEEDS[speedIdx];
      speedBtn.textContent = SPEEDS[speedIdx] + "×";
    };
    const skip = (d) => () => { audioEl.currentTime = Math.max(0, audioEl.currentTime + d); };
    if (ttsSupported()) {
      ttsBtn = h("button", { class: "pl-sm", onclick: () => {
        if (isSpeaking()) { stopTTS(); ttsBtn.textContent = ttsLabel; } else startTTS(ttsBtn);
      } }, ttsLabel);
    }
    player.append(
      h("div", { class: "pl-row" }, seek, time),
      h("div", { class: "pl-row pl-ctrls" },
        speedBtn,
        h("button", { class: "pl-skip", onclick: skip(-10), "aria-label": "10 Sekunden zurück" }, "↺10"),
        playBtn,
        h("button", { class: "pl-skip", onclick: skip(10), "aria-label": "10 Sekunden vor" }, "10↻"),
        ttsBtn || h("span", { class: "pl-sm", style: "visibility:hidden" }, "")));
  } else if (ttsSupported()) {
    // no mp3: the big button drives read-aloud with highlighting
    const TTS_SPEEDS = [0.88, 0.75, 1];
    speedBtn.textContent = "Normal";
    speedBtn.onclick = () => {
      speedIdx = (speedIdx + 1) % TTS_SPEEDS.length;
      ttsRate = TTS_SPEEDS[speedIdx];
      speedBtn.textContent = ["Normal", "Langsam", "Schnell"][speedIdx];
    };
    playBtn.onclick = () => (isSpeaking() ? (stopTTS(), setIcon(false)) : startTTS(null));
    player.append(h("div", { class: "pl-row pl-ctrls" },
      speedBtn, playBtn, h("span", { class: "muted small" }, "🗣 Vorlesen mit Hervorhebung")));
  }
  if (player.children.length) view.append(player);

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

  // --- approximate follow-along for the native mp3 (beta) --------------
  // The mp3 has no word timings, so we map playback progress onto the
  // sentences proportionally, skipping an estimated intro jingle.
  if (audioEl) {
    const sentences = [];
    let cur = [];
    for (const sp of spans) {
      cur.push(sp);
      if (/[.!?:]$/.test(sp.textContent.trim()) || sp.dataset.paraEnd) { sentences.push(cur); cur = []; }
    }
    if (cur.length) sentences.push(cur);
    const total = spans.length;
    const cumStart = [];
    let acc = 0;
    for (const s of sentences) { cumStart.push(acc / total); acc += s.length; }

    let hlIdx = -1;
    const clear = () => {
      if (hlIdx >= 0) sentences[hlIdx].forEach((s) => s.classList.remove("hl"));
      hlIdx = -1;
    };
    audioEl.addEventListener("timeupdate", () => {
      const d = audioEl.duration;
      if (!d || audioEl.paused) return;
      const intro = Math.min(9, d * 0.06);
      const frac = Math.max(0, Math.min(0.999, (audioEl.currentTime - intro) / (d - intro)));
      let idx = 0;
      for (let i = 0; i < cumStart.length; i++) if (cumStart[i] <= frac) idx = i;
      if (idx !== hlIdx) {
        clear();
        hlIdx = idx;
        sentences[idx].forEach((s) => s.classList.add("hl"));
        sentences[idx][0]?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
    audioEl.addEventListener("pause", clear);
    audioEl.addEventListener("ended", clear);
  }

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
  // updated in place so a playing mp3 keeps going
  const btn = h("button", { style: "width:100%;margin:12px 0" });
  const paint = () => {
    const done = !!state.essaysRead[essay.id];
    btn.className = "btn " + (done ? "ghost" : "green");
    btn.textContent = done ? "✓ Gelesen — Markierung entfernen" : "✓ Als gelesen markieren · +30 XP";
  };
  paint();
  btn.onclick = () => {
    if (state.essaysRead[essay.id]) {
      delete state.essaysRead[essay.id];
      save();
    } else {
      state.essaysRead[essay.id] = today();
      bumpActivity("essays");
      toast("Essay abgehakt! 🎉");
    }
    paint();
  };
  view.append(btn);
  view.append(h("div", { class: "player-spacer" }));
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
  const paragraph = spanEl?.parentElement?.textContent?.trim() || "";
  box.append(
    h("button", {
      class: "btn blue", style: "width:100%;margin-top:14px",
      onclick: () => openTutor({
        key: "essay-" + (essay?.id || "x"),
        title: essay?.title || res.word,
        context: `Essay: "${essay?.title}" (level ${essay?.level}).\nParagraph the student is reading:\n${paragraph}\n\nThe student tapped the word: "${res.word}".`,
        chips: [
          { label: "Diesen Satz erklären", prompt: `Explain the structure of the sentence containing "${res.word}" — word order, clauses, why each part is where it is.` },
          { label: "Warum diese Form?", prompt: `Why does "${res.word}" appear in this form here (case/conjugation/declension)?` },
          { label: "Welche Zeitform?", prompt: "Which tense is used in this paragraph and why?" },
        ],
      }),
    }, "💬 Lehrer fragen"),
    h("div", { class: "row", style: "margin-top:8px" },
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
