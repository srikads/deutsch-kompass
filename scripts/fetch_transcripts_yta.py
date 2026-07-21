# Fallback transcript fetcher using youtube-transcript-api (different endpoint
# than yt-dlp, less aggressively rate-limited for subtitle-only access).
# Same output format as fetch_transcripts.py: transcripts/<id>.txt with
# TITLE/VIDEO/DURATION headers and [mm:ss] paragraph marks. Skips existing.
#
# Usage: python scripts/fetch_transcripts_yta.py [playlist-name-filter]

import json
import sys
import time
from pathlib import Path

from youtube_transcript_api import YouTubeTranscriptApi

ROOT = Path(__file__).resolve().parent.parent
IDX = ROOT / "data" / "playlists_index.json"
OUT = ROOT / "transcripts"
OUT.mkdir(exist_ok=True)

only = sys.argv[1].lower() if len(sys.argv) > 1 else ""
api = YouTubeTranscriptApi()


def to_paragraphs(snippets):
    out, cur, cur_ts = [], [], ""
    for s in snippets:
        text = s.text.replace("\n", " ").strip()
        if not text or text.startswith("["):  # skip [Musik] etc.
            continue
        if not cur:
            m, sec = divmod(int(s.start), 60)
            cur_ts = f"[{m:02d}:{sec:02d}]"
        cur.append(text)
        if len(" ".join(cur)) > 400:
            out.append(f"{cur_ts} " + " ".join(cur))
            cur = []
    if cur:
        out.append(f"{cur_ts} " + " ".join(cur))
    return "\n\n".join(out)


playlists = json.loads(IDX.read_text(encoding="utf-8"))
seen, ok, fail, skip = set(), 0, 0, 0
for p in playlists:
    name = (p["playlist"] or "single").lower()
    if only and only not in name:
        continue
    for v in p["videos"]:
        vid = v["id"]
        if vid in seen:
            continue
        seen.add(vid)
        dest = OUT / f"{vid}.txt"
        if dest.exists():
            skip += 1
            continue
        try:
            tl = api.list(vid)
            try:
                t = tl.find_transcript(["en"])
            except Exception:
                t = tl.find_generated_transcript(["en", "de"])
            data = t.fetch()
            body = to_paragraphs(data.snippets if hasattr(data, "snippets") else data)
            if len(body) < 500:
                raise RuntimeError("transcript too short")
            header = f"TITLE: {v['title']}\nVIDEO: https://youtu.be/{vid}\nDURATION: {v['duration_min']} min\n\n"
            dest.write_text(header + body, encoding="utf-8")
            ok += 1
            print(f"OK   {vid}  {v['title'][:70]}", flush=True)
        except Exception as e:
            fail += 1
            print(f"FAIL {vid}  {v['title'][:50]}  ({type(e).__name__}: {str(e)[:80]})", flush=True)
        time.sleep(20)

print(f"\nDone: {ok} fetched, {skip} already present, {fail} failed -> {OUT}", flush=True)
