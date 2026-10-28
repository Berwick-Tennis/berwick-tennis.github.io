# Berwick Tennis Club — WDTA Saturday PM site

Live: https://davidthurmond-gif.github.io/berwick-a-reserve-4/

## Layout
- `index.html` + `hub.js` — **club home**: next round for every Berwick team, ladder positions, emergency tracker, club players.
- `club.json` / `club.js` — club-level data (teams, every Berwick player's appearances per team, emergency appearances). Generated, except the `manual` block.
- `teams/<slug>/` — one folder per team (`a2`, `a7`, `a10`, `a13`, `a-res-2`, `b2`, `rubbers-a1`): `index.html` (copied from `tools/team_template.html`), `data.json` + `data.js`.
- `script.js`, `style.css` — shared by all team pages and the hub.
- `winter-2026/` — archived Winter 2026 (A Reserve 4) site, frozen.
- `tools/trols_sync.py` — rebuilds all team data + `club.json` straight from trols.org.au (no browser needed; standard-library Python).

## Weekly update
```bash
python3 tools/trols_sync.py          # all teams (re-uses stored scoresheets, fetches new ones)
python3 tools/trols_sync.py --only a2
python3 tools/trols_sync.py --refetch   # re-download every scoresheet
python3 tools/trols_sync.py --discover  # list Saturday PM sections with a Berwick team
```
Then commit and push. Scores are posted Tuesday nights; the scheduled task runs Wednesday mornings.

To add a team, add it to `TEAMS` at the top of `tools/trols_sync.py` and run the sync.

## What's preserved between syncs (hand-maintained)
Per team (`teams/<slug>/data.json`): `roster` contact details / UTR / order, `availability`, `lineups`, `playerNotes`, `playerAliases`, and each club's `courtType` / `notes`.
Club (`club.json` → `manual`):
- `playerHomeTeam`: `{"Player Name": "slug"}` — overrides the auto-detected own team.
- `emergencies`: `[{"player", "date": "YYYY-MM-DD", "team": "slug", "opponent", "note"}]` — fill-ins not shown on a scoresheet.
- `playerAliases`: `{"Variant": "Canonical Name"}` across all teams.

## Emergency tracker
Every **E** on a trols scoresheet for a Berwick team counts as an emergency appearance (unless it's for the player's own team). WDTA allows 3 a season; the hub flags amber at 2 and red at 3.
