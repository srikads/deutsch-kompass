# Parses the official Goethe-Zertifikat B1 Wortliste PDF into data/b1_wordlist.json.
# Downloads the PDF on first run. Re-runnable; output is deterministic.
#
# Output entries: {"lemma": str, "display": str, "pos": "noun"|"verb"|"other",
#                  "article": "der|die|das" (nouns), "plural": str (nouns),
#                  "forms": str (verbs, e.g. "faehrt ab, fuhr ab, ist abgefahren")}

import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "data" / "b1_wortliste.pdf"
OUT = ROOT / "data" / "b1_wordlist.json"
URL = "https://www.goethe.de/pro/relaunch/prf/de/Goethe-Zertifikat_B1_Wortliste.pdf"

LOWER = "a-zäöüß"
NOUN_RE = re.compile(r"^(der|die|das|der/die|die/der) ([A-ZÄÖÜ][A-Za-zäöüßÄÖÜ-]+)(?:, *(¨?-[a-zäöüß]*|¨|-)| *\(.*\))?")
VERB_RE = re.compile(rf"^([{LOWER}]+(?:en|n)), ([{LOWER}]+.*)$")
SINGLE_RE = re.compile(rf"^([{LOWER}][{LOWER}-]+)$")
CONT_RE = re.compile(rf"^([{LOWER}(].*[^.!?])$")  # conjugation continuation lines


def main():
    if not PDF.exists():
        PDF.parent.mkdir(parents=True, exist_ok=True)
        print("Downloading Wortliste PDF...")
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
        PDF.write_bytes(urllib.request.urlopen(req, timeout=60).read())

    from pypdf import PdfReader

    reader = PdfReader(str(PDF))
    lines = []
    for page in reader.pages[15:]:  # skip intro pages
        text = page.extract_text() or ""
        for ln in text.splitlines():
            ln = ln.strip()
            if ln and not ln.startswith(("WORTLISTE", "VS_", "GOETHE", "Seite")):
                lines.append(ln)

    entries = {}

    def add(lemma, **kw):
        key = kw.get("article", "") + " " + lemma if kw.get("article") else lemma
        if key not in entries:
            entries[key] = {"lemma": lemma, **kw}

    i = 0
    while i < len(lines):
        ln = lines[i]
        m = NOUN_RE.match(ln)
        if m:
            art, noun, plural = m.group(1), m.group(2), m.group(3) or ""
            add(noun, display=f"{art} {noun}" + (f", {plural}" if plural else ""),
                pos="noun", article=art.split("/")[0], plural=plural)
            i += 1
            continue
        m = VERB_RE.match(ln)
        if m and not re.search(r"[.!?]$", ln):
            lemma, forms = m.group(1), m.group(2)
            # conjugation info often wraps onto following short lines
            j = i + 1
            while j < len(lines) and len(lines[j]) < 40 and CONT_RE.match(lines[j]) \
                    and not NOUN_RE.match(lines[j]) and not VERB_RE.match(lines[j]) \
                    and re.search(r"\b(hat|ist)\b", forms) is None:
                forms += " " + lines[j]
                j += 1
            forms = re.sub(r",\s*$", "", re.sub(r"\s+", " ", forms)).strip()
            add(lemma, display=lemma, pos="verb", forms=forms)
            i = j
            continue
        m = SINGLE_RE.match(ln)
        if m and len(m.group(1)) > 1:
            add(m.group(1), display=m.group(1), pos="other")
        i += 1

    out = sorted(entries.values(), key=lambda e: e["lemma"].lower())
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    nouns = sum(1 for e in out if e["pos"] == "noun")
    verbs = sum(1 for e in out if e["pos"] == "verb")
    print(f"Total: {len(out)} (nouns={nouns}, verbs={verbs}, other={len(out) - nouns - verbs}) -> {OUT}")


if __name__ == "__main__":
    sys.exit(main())
