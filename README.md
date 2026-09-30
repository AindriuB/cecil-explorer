# Cecil's war: explorer

A day-by-day explorer of Lt John Cecil Bannister's war (1942–1952): a map, a date ribbon, his documented status, the battalion's officers on the chosen day, and his letters. It is a static site suitable for GitHub Pages.

All content comes from the research repository [AindriuB/cecil](https://github.com/AindriuB/cecil). The explorer holds no research of its own.

## Update the data

```sh
python3 scripts/sync_data.py                   # private build, reads ../cecil
python3 scripts/sync_data.py --source PATH     # another checkout
python3 scripts/sync_data.py --public          # public-safe build
```

The private build writes `data/explorer.private.json`, which git ignores and the app prefers when present. The public build writes `data/explorer.json`, which is committed and published. Both are made from the research repo's `timeline/build/timeline.json`, `timeline/build/network.json`, `research/narrative/story-draft.md` and the letter metadata. Rebuild the research repo first (`scripts/check.sh` there).

## Private and public builds

- **Private (default):** includes Cecil's letters, the sourced account, family memory and family records. Keep this out of any public site.
- **Public (`--public`):** leaves out the letters, the account, family testimony, family and civil records, post-war entries and family people. It keeps the documented service record and the battalion context.
- GitHub Pages on a standard account is **public**. Publish only a `--public` build unless the family decides otherwise. Museum-supplied images are not included in either build.

## Run locally

```sh
python3 -m http.server 8765
```

Then open <http://localhost:8765>. Opening `index.html` as a file does not work, because the browser blocks loading the data.

## How to read it

- Ink blue: Cecil, documented. Khaki: the battalion (not proof Cecil was there). Amber: family memory. Violet: inference. Hatched: no record.
- Every item shows its source IDs from the research registers.
- Map tiles are modern OpenStreetMap maps, not wartime positions.
