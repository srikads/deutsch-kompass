# Deutsch Kompass — B1 Trainer (PWA)

A personal, offline-capable PWA for Goethe B1 exam prep in 3 months. All data
(flashcards, progress, plan) lives in your browser — no backend, no account.

## Run it

```
python -m http.server 8123
```

then open http://localhost:8123 — or any other static file server.
No build step, no dependencies.

**On your phone:** the easiest way is to push this folder to GitHub and enable
GitHub Pages (Settings → Pages → deploy from branch). Open the page on your
phone and use "Add to Home Screen" — it installs as an app and works offline.

## What's inside

| Tab | What it does |
|-----|--------------|
| **Heute** | Exam countdown, streak, auto-checking daily checklist, quick stats |
| **Lesen** | 60 real DW essays (B1 Top-Thema with native audio + B2), read-checklist, filters, tap-to-translate, TTS read-aloud with highlighting |
| **Vokabeln** | Flashcards with spaced repetition, multiple-choice quiz, Goethe-B1-Wortliste (2869 words) as a check-off list with coverage % |
| **Üben** | 8 grammar drills (der/die/das + Perfekt generated from the real B1 wordlist), 3 Goethe-format Lesen sets, 9 Schreiben prompts with Redemittel and self-check |
| **Plan** | 12-week study plan (72 tasks) with dates, checklist and progress; settings, data export/import |

## Content pipeline (re-runnable)

- `node scripts/fetch_content.mjs` — pulls fresh essays from DW's RSS feeds
  (Top-Thema B1, Video-Thema/Nachrichten B2) into `data/essays.json`.
  Existing essays are kept, so your read-progress survives refreshes.
- `python scripts/parse_wordlist.py` — rebuilds `data/b1_wordlist.json` from
  the official Goethe B1 Wortliste PDF (downloads it if missing).

After refreshing content, bump `VERSION` in `sw.js` so installed clients pick
up the new data.

## Word lookup chain (tap any word while reading)

1. DW's own glossary for that essay (German definition)
2. Goethe B1 wordlist (article, plural, verb forms + B1 tag)
3. Local cache (works offline)
4. Online: MyMemory translation + English Wiktionary definitions (free, no key)

## Backup

Plan → Einstellungen → "Daten exportieren" downloads a JSON backup of all your
progress; "Daten importieren" restores it (e.g. when switching devices).
