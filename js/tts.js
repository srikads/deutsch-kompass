// Read-aloud via the Web Speech API with synchronized highlighting.
// Sentence-level highlighting always works (utterance per sentence);
// word-level kicks in where the browser fires boundary events.

let current = null; // { spans, sentences, idx, playing, rate }

function germanVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "de-DE" && /neural|natural|online/i.test(v.name)) ||
    voices.find((v) => v.lang === "de-DE") ||
    voices.find((v) => v.lang.startsWith("de")) ||
    null
  );
}
// voices load async in some browsers
if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices();

export function ttsSupported() {
  return typeof speechSynthesis !== "undefined";
}

export function stopTTS() {
  if (!ttsSupported()) return;
  speechSynthesis.cancel();
  if (current) unhighlight(current);
  current = null;
}

function unhighlight(c) {
  for (const s of c.spans) s.classList.remove("hl");
}

// spans: array of word <span> elements in reading order
export function speak(spans, { rate = 0.9, onEnd } = {}) {
  stopTTS();
  if (!ttsSupported() || !spans.length) return;

  // group spans into sentences by trailing punctuation
  const sentences = [];
  let cur = [];
  for (const sp of spans) {
    cur.push(sp);
    if (/[.!?:]$/.test(sp.textContent.trim()) || sp.dataset.paraEnd) {
      sentences.push(cur);
      cur = [];
    }
  }
  if (cur.length) sentences.push(cur);

  const c = (current = { spans, sentences, idx: 0, playing: true, rate, onEnd });
  speakSentence(c);
}

function speakSentence(c) {
  if (c !== current || c.idx >= c.sentences.length) {
    if (c === current) {
      unhighlight(c);
      current = null;
      c.onEnd?.();
    }
    return;
  }
  const spans = c.sentences[c.idx];
  const text = spans.map((s) => s.textContent).join(" ");
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "de-DE";
  const v = germanVoice();
  if (v) u.voice = v;
  u.rate = c.rate;

  // char offset of each word within this sentence for boundary mapping
  const offsets = [];
  let pos = 0;
  for (const s of spans) {
    offsets.push(pos);
    pos += s.textContent.length + 1;
  }

  u.onstart = () => {
    unhighlight(c);
    spans.forEach((s) => s.classList.add("hl"));
    spans[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  u.onboundary = (ev) => {
    if (ev.name && ev.name !== "word") return;
    let wi = 0;
    for (let i = 0; i < offsets.length; i++) if (offsets[i] <= ev.charIndex) wi = i;
    unhighlight(c);
    spans[wi]?.classList.add("hl");
  };
  u.onend = () => {
    c.idx++;
    speakSentence(c);
  };
  u.onerror = () => {
    c.idx++;
    speakSentence(c);
  };
  speechSynthesis.speak(u);
}

export function isSpeaking() {
  return !!current;
}
