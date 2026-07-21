# Fetches video titles/ids/durations for the playlists in playlist.md
# (flat extraction — no downloads, no transcripts) into data/playlists_index.json.
# Zero-cost triage step for the grammar-lessons feature.

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "playlists_index.json"

urls = []
for line in (ROOT / "playlist.md").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line.startswith("http"):
        urls.append(line.split("&si=")[0].split("?si=")[0])

result = []
for url in urls:
    try:
        proc = subprocess.run(
            ["yt-dlp", "--flat-playlist", "-J", url],
            capture_output=True, text=True, encoding="utf-8", timeout=120,
        )
        data = json.loads(proc.stdout)
    except Exception as e:
        print(f"FAIL {url}: {e}", file=sys.stderr)
        continue
    if data.get("_type") == "playlist":
        entries = data.get("entries") or []
        result.append({
            "playlist": data.get("title"),
            "channel": data.get("channel") or data.get("uploader"),
            "url": url,
            "count": len(entries),
            "videos": [
                {"title": e.get("title"), "id": e.get("id"),
                 "duration_min": round((e.get("duration") or 0) / 60, 1)}
                for e in entries
            ],
        })
    else:  # single video link
        result.append({
            "playlist": None, "channel": data.get("channel"), "url": url, "count": 1,
            "videos": [{"title": data.get("title"), "id": data.get("id"),
                        "duration_min": round((data.get("duration") or 0) / 60, 1)}],
        })
    last = result[-1]
    print(f"OK  {last['playlist'] or 'single video'} ({last['channel']}): {last['count']} videos")

OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
total = sum(p["count"] for p in result)
mins = sum(v["duration_min"] for p in result for v in p["videos"])
print(f"\nTotal: {total} videos, ~{round(mins / 60, 1)} hours -> {OUT}")
