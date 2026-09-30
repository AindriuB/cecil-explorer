#!/usr/bin/env python3
"""Copy the research repo's generated data into data/ for the explorer.

    python3 scripts/sync_data.py                      # private build -> data/explorer.private.json (git-ignored)
    python3 scripts/sync_data.py --source PATH        # another checkout
    python3 scripts/sync_data.py --public             # public build -> data/explorer.json (committed)

The research repo (github.com/AindriuB/cecil) is the only source of truth.
This script never edits it; it reads timeline/build/*.json, the narrative
draft and the letter metadata, and writes trimmed JSON here.
"""
import argparse, json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
PRIVATE_LAYERS = {"family-civil", "testimony", "postwar"}

# Story sections -> the dates they cover (for linking the account to the ribbon).
SECTION_DATES = {
    "1": ("1916-04-13", "1942-03-21"), "2": ("1942-03-19", "1944-03-31"),
    "3": ("1944-04-01", "1944-04-30"), "4": ("1944-05-01", "1944-05-31"),
    "5": ("1944-06-01", "1944-11-28"), "6": ("1944-11-29", "1944-12-31"),
    "7": ("1945-01-01", "1945-03-17"), "8": ("1945-03-18", "1945-04-30"),
    "9": ("1945-05-01", "1945-09-30"), "10": ("1945-10-01", "1945-12-31"),
    "11": ("1946-01-01", "1952-12-31"),
}


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def letter_dates(src):
    out = {}
    for m in sorted((src / "collection/letters").glob("CEC-L*/metadata.json")):
        d = load(m)
        out[d["letter_id"]] = {
            "date": d.get("date_normalized") or "",
            "as_written": d.get("date_as_written", ""),
            "author": d.get("author", ""),
            "recipient": d.get("recipient", ""),
        }
    return out


def story(src, letters):
    """Split the narrative draft into sections, paragraphs and verified quotes."""
    text = (src / "research/narrative/story-draft.md").read_text(encoding="utf-8")
    sections, quotes = [], []
    for block in re.split(r"\n(?=## \d+\. )", text)[1:]:
        head, _, body = block.partition("\n")
        m = re.match(r"## (\d+)\. (.+)", head)
        num, title = m.group(1), m.group(2).strip()
        body = body.split("\n---")[0]
        paras = []
        for p in re.split(r"\n(?=\*\*¶)", body):
            p = p.strip()
            if not p.startswith("**¶"):
                continue
            pid = re.match(r"\*\*¶([\d.]+)\*\*", p).group(1)
            cites = re.findall(r"\[([^\[\]]+)\]\s*$", p)
            cite = cites[-1] if cites else ""
            clean = re.sub(r"\*\*¶[\d.]+\*\*\s*", "", p)
            clean = re.sub(r"\s*\[[^\[\]]+\]\s*$", "", clean)
            paras.append({"id": pid, "text": clean, "cite": cite})
            for q in re.findall(r"^> (.+)$", p, re.M):
                ids = re.findall(r"CEC-L\d{6}", cite)
                lid = ids[0] if ids else ""
                quotes.append({"text": q, "letter": lid, "para": pid, "section": num,
                               "cite": cite, **({"date": letters[lid]["date"],
                                                 "as_written": letters[lid]["as_written"],
                                                 "recipient": letters[lid]["recipient"]} if lid in letters else {})})
        gap = re.search(r"\*Not known:\*(.+)", body)
        lo, hi = SECTION_DATES.get(num, ("", ""))
        sections.append({"num": num, "title": title, "from": lo, "to": hi,
                         "paras": paras, "not_known": gap.group(1).strip() if gap else ""})
    return sections, quotes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=str(HERE.parent / "cecil"))
    ap.add_argument("--public", action="store_true",
                    help="omit letters, the story, family testimony and family/civil records")
    a = ap.parse_args()
    src = Path(a.source).resolve()
    tl = load(src / "timeline/build/timeline.json")
    net = load(src / "timeline/build/network.json")

    places = {p["id"]: {"name": (p.get("modern_name") or p["name_as_written"][0]),
                        "as_written": p["name_as_written"],
                        "ll": p["geometry"]["coordinates"][::-1] if p.get("geometry") else None,
                        "r": p.get("radius_m"), "status": p.get("identification", "")}
              for p in tl["places"]}

    events = []
    for e in tl["events"]:
        if a.public and (e["layer"] in PRIVATE_LAYERS or any(s.startswith("CEC-L") for s in e.get("sources", []))):
            continue
        events.append({k: e.get(k) for k in ("id", "start", "end", "date", "date_as_written", "layer", "type",
                                            "event", "place", "unit", "people", "sources", "notes",
                                            "confidence", "location_basis", "claims") if e.get(k) not in (None, [], "")})

    in_ms = {m["person"] for m in net["memberships"]}
    def private_person(k, v):
        role = v.get("role", "")
        return k != "P-cecil" and (re.search(r"family|witness|cousin|troopship", role) or k not in in_ms)
    people = {k: {"name": v["name"], "role": v.get("role", "")} for k, v in net["people"].items()
              if not (a.public and private_person(k, v))}
    units = {k: {"name": v["name"], "type": v.get("type", ""), "parents": [p["unit"] for p in v.get("parents", [])]}
             for k, v in net["units"].items()}
    keep = ("id", "person", "unit", "post", "lo", "hi", "flag", "evidence", "status", "rank", "sources", "decision", "notes")
    memberships = [{k: m.get(k) for k in keep if m.get(k) not in (None, "", [])}
                   for m in net["memberships"] if m["person"] in people]

    if a.public:
        used = {e.get("place") for e in events}
        places = {k: v for k, v in places.items() if k in used}
    out = {"generated_from": str(src.name), "public": a.public, "notice": tl.get("notice", ""),
           "events": events, "places": places, "people": people, "units": units,
           "companies": net["companies"], "memberships": memberships,
           "relations": [r for r in net["relations"] if r["from"] in people and r["to"] in people],
           "returns": net.get("returns", [])}
    if not a.public:
        letters = letter_dates(src)
        out["sections"], out["quotes"] = story(src, letters)
        out["letters"] = letters
    else:
        out["sections"], out["quotes"], out["letters"] = [], [], {}

    (HERE / "data").mkdir(exist_ok=True)
    target = HERE / ("data/explorer.json" if a.public else "data/explorer.private.json")
    target.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{target.relative_to(HERE)}: {len(events)} events, {len(memberships)} memberships, "
          f"{len(out['quotes'])} quotes, {len(out['sections'])} sections ({'public' if a.public else 'private'} build)")


if __name__ == "__main__":
    sys.exit(main())
