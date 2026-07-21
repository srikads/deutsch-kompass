# Downloads auto-generated subtitles for every video in data/playlists_index.json
# into transcripts/<video_id>.txt (plain text, deduplicated lines, with a
# [mm:ss] timestamp at the start of each paragraph so lessons can link back).
#
# Usage:
#   python scripts/fetch_transcripts.py            # all videos (skips existing)
#   python scripts/fetch_transcripts.py b1         # only playlists whose name contains "b1"
#
# Zero-token step: run this before any LLM distillation.

import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IDX = ROOT / "data" / "playlists_index.json"
OUT = ROOT / "transcripts"
OUT.mkdir(exist_ok=True)

only = sys.argv[1].lower() if len(sys.argv) > 1 else ""


def vtt_to_text(vtt: str) -> str:
    """Collapse a VTT auto-sub file into readable paragraphs with [mm:ss] marks."""
    lines = []
    ts = ""
    for raw in vtt.splitlines():
        m = re.match(r"^(\d\d):(\d\d):(\d\d)\.\d\d\d --> ", raw)
        if m:
            h, mnt, s = int(m.group(1)), int(m.group(2)), int(m.group(3))
            ts = f"[{h * 60 + mnt:02d}:{s:02d}]"
            continue
        if not raw.strip() or raw.startswith(("WEBVTT", "Kind:", "Language:", "NOTE")):
            continue
        text = re.sub(r"<[^>]+>", "", raw).strip()  # strip inline word timing tags
        if text and (not lines or lines[-1][1] != text):  # drop rolling duplicates
            lines.append((ts, text))
    # group into ~30s paragraphs
    out, cur, cur_ts = [], [], ""
    for ts, text in lines:
        if not cur:
            cur_ts = ts
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
            # throttled: YouTube 429s aggressive subtitle fetching
            time.sleep(10)
            subprocess.run(
                ["yt-dlp", "--skip-download", "--write-auto-subs", "--sub-langs", "en.*,de.*",
                 "--sub-format", "vtt", "--js-runtimes", "node", "--sleep-requests", "2",
                 "--retry-sleep", "http:30", "-o", str(OUT / "%(id)s"), f"https://youtu.be/{vid}"],
                capture_output=True, text=True, timeout=300, check=True,
            )
            vtts = sorted(OUT.glob(f"{vid}*.vtt"))
            if not vtts:
                raise RuntimeError("no subtitles available")
            # prefer English subs (channel teaches in EN), else German
            pick = next((f for f in vtts if ".en" in f.name), vtts[0])
            header = f"TITLE: {v['title']}\nVIDEO: https://youtu.be/{vid}\nDURATION: {v['duration_min']} min\n\n"
            dest.write_text(header + vtt_to_text(pick.read_text(encoding="utf-8")), encoding="utf-8")
            for f in vtts:
                f.unlink()
            ok += 1
            print(f"OK   {vid}  {v['title'][:70]}")
        except Exception as e:
            fail += 1
            print(f"FAIL {vid}  {v['title'][:50]}  ({e})")

print(f"\nDone: {ok} fetched, {skip} already present, {fail} failed -> {OUT}")
