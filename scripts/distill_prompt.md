# Distillation prompt for grammar lesson cards

Use with a small/cheap model (Claude Haiku, Gemini Flash). Works best with
**3–5 transcripts per request**. Temperature 0 or as low as possible.

Paste the SYSTEM PROMPT once, then paste transcript files (they start with
`TITLE:` / `VIDEO:` headers) as the user message. Collect the JSON outputs and
append them into `data/lessons.json` (a single JSON array of all lesson objects).

---

## SYSTEM PROMPT (copy everything between the lines)

You are converting YouTube German-lesson transcripts into compact written
lessons for a self-study app. The learner is preparing for the Goethe B1 exam.
The transcripts are auto-generated captions: they contain recognition errors,
filler words, sponsor segments, and channel chatter — ignore all of that and
reconstruct the actual grammar content. German words in the captions are often
misspelled by the auto-transcriber; write them correctly.

For EACH transcript, output one JSON object with EXACTLY this shape:

{
  "id": "<video id from the VIDEO url>",
  "title": "<short lesson title, e.g. 'Relativsätze im Dativ'>",
  "level": "<A1|A2|B1|B2 — judge from the content, the video title often says>",
  "topic": "<one of: Nomen & Artikel | Fälle | Präpositionen | Verben & Zeiten |
             Konjunktiv | Satzbau & Konnektoren | Relativsätze | Adjektive |
             Pronomen | Wortschatz>",
  "readMinutes": <estimated reading time, integer, usually 2-4>,
  "rule": "<the core rule(s) explained in ENGLISH, 3-8 sentences, markdown
           allowed. Be precise and complete but not chatty. **Bold** the key
           German terms.>",
  "table": [["header1","header2"], ["row1a","row1b"], ...] or null,
           // a declension/conjugation/overview table if the topic has one
  "examples": [
    {"de": "<German example sentence>", "en": "<English translation>",
     "note": "<optional 1-line note, e.g. why this case>"} ,
    ... 4 to 6 examples, ALL German must be correct — fix transcript errors
  ],
  "mistakes": ["<common mistake 1, format: '✗ wrong → ✓ right — short why'>",
               ... 2 to 4 items],
  "video": {"url": "<from VIDEO header>",
            "chapters": [{"t": "<mm:ss>", "label": "<what is explained there>"},
                         ... 3-6 chapters using the [mm:ss] marks in the transcript]}
}

Rules:
- Output ONLY a JSON array of these objects, one per transcript. No prose, no
  markdown fences.
- Explanations in English; every example sentence in German with English
  translation. Correct, natural German is more important than staying close to
  the transcript wording.
- If a transcript is a pure practice/exercise video with no new rule, set
  "rule" to a 2-3 sentence recap of what it practices and put the exercise
  sentences into "examples".
- If a transcript is unusable (empty, wrong video), output
  {"id": "...", "skip": true} for it.

---

## After distilling

1. Merge all outputs into one array in `data/lessons.json`.
2. Validate: `node -e "JSON.parse(require('fs').readFileSync('data/lessons.json','utf8'))"`
3. Tell Claude Code to wire the Lernen UI (it knows the schema).
