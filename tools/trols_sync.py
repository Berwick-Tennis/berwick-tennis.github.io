#!/usr/bin/env python3
"""
Berwick Tennis Club — WDTA (trols.org.au) sync.

Rebuilds every Berwick team's data from trols.org.au and writes:
  teams/<slug>/data.json + data.js   (one per team, same shape the team page uses)
  club.json + club.js                (club hub: teams, players, emergency tracker)

Hand-maintained fields are preserved on every run: roster contact details / UTR /
order, availability, lineups, playerNotes, playerAliases, club court types & notes,
and everything under club.json "manual".

Usage (from the repo root):  python3 tools/trols_sync.py [--only a-res-2] [--refetch]
Only needs the Python standard library.
"""
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.request

BASE = "https://www.trols.org.au/wdta/"
DAYTIME = "AP"
CLUB = "Berwick"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Berwick's Saturday PM teams. Discover new ones with --discover.
TEAMS = [
    {"slug": "a2", "label": "A2", "section": "AP004"},
    {"slug": "a7", "label": "A7", "section": "AP009"},
    {"slug": "a10", "label": "A10", "section": "AP012"},
    {"slug": "a13", "label": "A13", "section": "AP015"},
    {"slug": "a-res-2", "label": "A Res 2", "section": "AP020"},
    {"slug": "b2", "label": "B2", "section": "AP031"},
    {"slug": "rubbers-a1", "label": "Rubbers A1", "section": "AP034"},
]

MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


# ---------------------------------------------------------------- fetching

def fetch(path):
    url = path if path.startswith("http") else BASE + path
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Berwick club site sync)"})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read().decode("utf-8", errors="ignore")
            time.sleep(0.25)  # be polite
            return body
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))


def text(s):
    s = re.sub(r"<br\s*/?>", " ", s or "")
    s = html.unescape(re.sub(r"<[^>]+>", "", s)).replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def iso(d):
    """'10 Oct 26' -> '2026-10-10'"""
    dd, mm, yy = d.split()
    return f"20{yy}-{MONTHS[mm[:3]]:02d}-{int(dd):02d}"


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def cells(row):
    return re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)


# ---------------------------------------------------------------- trols parsing

def parse_options(page, select_id):
    m = re.search(rf'id="{select_id}".*?</select>', page, re.S)
    if not m:
        return {}
    return {v: text(n) for v, n in re.findall(r'<option value="([^"]+)"[^>]*>([^<]*)', m.group(0)) if v}


def parse_competition_name(page):
    m = re.search(r'<option value="' + DAYTIME + r'" selected>([^<]*)', page)
    return text(m.group(1)) if m else ""


def parse_venues(page):
    """Section Information block -> {team name: venue dict}"""
    i = page.find("Section Information")
    if i < 0:
        return {}
    block = page[i:page.find("</table>", i)]
    rows = re.findall(r"<tr>(.*?)</tr>", block, re.S)
    venues, cur = {}, None
    for r in rows:
        c = [text(x) for x in cells(r)]
        if len(c) >= 2 and c[0].isdigit():
            name = c[1]
            if name.lower() == "bye":
                cur = None
                continue
            melway = c[2].replace("Melway", "").strip() if len(c) > 2 else ""
            cur = venues.setdefault(name, {"name": name, "melway": melway, "address": "", "clubhousePhone": "",
                                           "contactName": "", "contactPhone": ""})
        elif cur and len(c) == 2 and c[0] == "" and not c[1].startswith("Club Contact"):
            raw = cells(r)[1]
            parts = [text(p) for p in re.split(r"<br\s*/?>", raw)]
            addr = []
            for p in parts:
                if p.lower().startswith("club house ph"):
                    cur["clubhousePhone"] = p.split(":", 1)[1].strip()
                elif p:
                    addr.append(p)
            cur["address"] = ", ".join(addr).replace(", ,", ",")
        elif cur and len(c) >= 2 and c[1].startswith("Club Contact"):
            cur["contactName"] = c[1].split(":", 1)[1].strip()
            if len(c) > 2 and ":" in c[2]:
                cur["contactPhone"] = c[2].split(":", 1)[1].strip()
    return venues


def parse_team_fixture(page):
    """Rows from 'Fixture for <team>' -> (rounds, extras). extras = No Play dates + finals."""
    i = page.find("Fixture for")
    if i < 0:
        return [], []
    body = page[i:]
    rounds, extras = [], []
    for r in re.findall(r"<tr>(.*?)</tr>", body, re.S):
        c = [text(x) for x in cells(r)]
        if len(c) >= 3 and re.match(r"\d+ \w{3} \d{2}$", c[1] or ""):
            if c[0].isdigit() and len(c) >= 4:
                rounds.append({"round": int(c[0]), "date": iso(c[1]), "home": c[2], "away": c[3]})
            else:
                extras.append({"date": iso(c[1]), "note": c[2] or "No Play"})
    # Finals line(s): "No Play - 6 Mar 27 | Semi Final - 13 Mar 27 | Grand Final - 20 Mar 27"
    for label, d in re.findall(r"([A-Za-z ]+?)\s*-\s*(\d{1,2} \w{3} \d{2})", text(body[body.find("Finals"):]) if "Finals" in body else ""):
        extras.append({"date": iso(d), "note": label.strip(), "finals": "Final" in label})
    return rounds, extras


def parse_results(page):
    """results.php -> [{round, date, matches:[{matchId, home, away, homePts, homeR, homeS, homeG, ...}]}]"""
    out = []
    pieces = re.split(r'(<td colspan="\d+" align="left" class="sb">.*?</td>)', page, flags=re.S)
    cur = None
    for p in pieces:
        hm = re.search(r"(\d{1,2} \w{3} \d{2})&nbsp;&nbsp;Rd\.<b>([^<]+)</b>", p)
        if hm and 'class="sb"' in p:
            rd = hm.group(2).strip()
            cur = {"round": int(rd) if rd.isdigit() else rd, "date": iso(hm.group(1)), "matches": []}
            out.append(cur)
            continue
        if cur is None:
            continue
        for row in re.findall(r'<tr valign="middle">(.*?)</tr>', p, re.S):
            c = cells(row)
            mid = re.search(r"open_match\([^,]*,\s*'[^']*',\s*'([^']+)'\)", row)
            vals = [text(x) for x in c]
            if len(vals) == 11:      # Pts R S G | Pts R S G
                h = dict(zip(["homePts", "homeR", "homeS", "homeG"], vals[1:5]))
                a = dict(zip(["awayPts", "awayR", "awayS", "awayG"], vals[6:10]))
            elif len(vals) == 9:     # rubbers comps: Pts S G | Pts S G
                h = dict(zip(["homePts", "homeS", "homeG"], vals[1:4])); h["homeR"] = None
                a = dict(zip(["awayPts", "awayS", "awayG"], vals[5:8])); a["awayR"] = None
            else:
                continue
            m = {"matchId": mid.group(1) if mid else None, "home": vals[0], "away": vals[-1]}
            for k, v in {**h, **a}.items():
                if v is None or v == "":
                    m[k] = None if v is None else 0
                else:
                    m[k] = float(v) if "Pts" in k else int(float(v))
            out[-1]["matches"].append(m)
    return [r for r in out if r["matches"]]


def parse_match(page):
    """match_popup.php -> players (with E flags), rubbers, totals."""
    players = []  # (pos_in_doc, emergency, index, name)
    for m in re.finditer(r"<tr><td>((?:(?!</td>).)*)</td><td>(\d+)\.\s+([^<]+)</td></tr>", page, re.S):
        players.append((m.start(), text(m.group(1)) == "E", int(m.group(2)), text(m.group(3))))
    rubber_rows = [(m.start(), m) for m in re.finditer(
        r'<tr valign="top" align="center"><td>([^<]*)</td><td[^>]*>(.*?)</td><td>([^<]*)</td></tr>', page, re.S)]
    first_rubber = rubber_rows[0][0] if rubber_rows else (players[-1][0] + 1 if players else 0)
    home = [p for p in players if p[0] < first_rubber]
    away = [p for p in players if p[0] > first_rubber]
    tot = re.search(r'<tr style="font-weight:bold" align="center"><td class="separate">(.*?)</td>'
                    r'<td class="separate">(.*?)</td><td class="separate">(.*?)</td>', page, re.S)
    totals = None
    if tot:
        hr = text(tot.group(1)).split(); ar = text(tot.group(3)).split(); g = text(tot.group(2)).split("-")
        try:
            totals = {"homeR": int(hr[0]), "homeS": int(hr[1]), "homeG": int(g[0]), "awayG": int(g[1]),
                      "awayS": int(ar[0]), "awayR": int(ar[1])}
        except (IndexError, ValueError):
            totals = None
    return home, away, [m for _, m in rubber_rows], totals


def build_rubbers(home, away, rubber_matches, alias):
    hn = {i: alias(n) for _, _, i, n in home}
    an = {i: alias(n) for _, _, i, n in away}
    rubbers = []
    for n, m in enumerate(rubber_matches, 1):
        hi = [int(x) for x in re.findall(r"\d+", m.group(1))]
        ai = [int(x) for x in re.findall(r"\d+", m.group(3))]
        sets = []
        for s in re.split(r"<br\s*/?>", m.group(2)):
            sm = re.match(r"\s*(\d+)\s*-\s*(\d+)", text(s))
            if sm:
                sets.append([int(sm.group(1)), int(sm.group(2))])
        hs = sum(1 for a, b in sets if a > b); as_ = sum(1 for a, b in sets if b > a)
        hg = sum(a for a, _ in sets); ag = sum(b for _, b in sets)
        winner = "home" if (hs, hg) > (as_, ag) else "away"
        rubbers.append({
            "rubber": n, "type": "doubles" if len(hi) > 1 or len(ai) > 1 else "singles",
            "homePlayers": [hn.get(i, f"#{i}") for i in hi], "awayPlayers": [an.get(i, f"#{i}") for i in ai],
            "sets": sets, "homeSets": hs, "awaySets": as_, "homeGames": hg, "awayGames": ag, "winner": winner,
        })
    return rubbers


def set_complete(a, b):
    hi, lo = max(a, b), min(a, b)
    return (hi >= 6 and hi - lo >= 2) or hi == 7 or (hi >= 10 and hi - lo >= 2) or (hi == 1 and lo == 0)


def fix_incomplete_rubbers(rubbers, home_r):
    """Washed-out / retired rubbers: trust the official rubber count for who got the rubber."""
    done = [r for r in rubbers if r["sets"] and all(set_complete(a, b) for a, b in r["sets"]) and r["homeSets"] != r["awaySets"]]
    todo = [r for r in rubbers if r not in done]
    if not todo:
        return
    need_home = home_r - sum(1 for r in done if r["winner"] == "home")
    for r in todo:
        r["incomplete"] = True
        r["winner"] = "home" if need_home > 0 else "away"
        need_home -= 1 if r["winner"] == "home" else 0


# ---------------------------------------------------------------- helpers

def load_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def write_site_data(folder, data, var="SITE_DATA"):
    os.makedirs(folder, exist_ok=True)
    name = "club" if var == "CLUB_DATA" else "data"
    with open(os.path.join(folder, f"{name}.json"), "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    with open(os.path.join(folder, f"{name}.js"), "w") as f:
        f.write(f"window.{var} = ")
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write(";\n")


def most_common(lst):
    return max(set(lst), key=lst.count) if lst else None


# ---------------------------------------------------------------- per-team sync

def sync_team(cfg, club_manual, refetch=False):
    sec, slug = cfg["section"], cfg["slug"]
    folder = os.path.join(ROOT, "teams", slug)
    old = load_json(os.path.join(folder, "data.json"), {})
    aliases = {**club_manual.get("playerAliases", {}), **old.get("playerAliases", {})}
    alias = lambda n: aliases.get(n, n)  # noqa: E731

    sec_page = fetch(f"fixture.php?daytime={DAYTIME}&section={sec}&style=")
    comp = parse_competition_name(sec_page)
    section_name = parse_options(sec_page, "section").get(sec, sec)
    team_opts = parse_options(sec_page, "team")
    our_code = next((k for k, v in team_opts.items() if v == CLUB), None)
    if not our_code:
        raise SystemExit(f"{CLUB} not found in {sec}")

    venues, all_rounds, our_rounds, our_extras = {}, {}, [], []
    for code, name in team_opts.items():
        page = fetch(f"fixture.php?daytime={DAYTIME}&section={sec}&team={code}&style=")
        if not venues:
            venues = parse_venues(page)
        rounds, extras = parse_team_fixture(page)
        for r in rounds:
            key = (r["round"], r["date"])
            all_rounds.setdefault(key, set()).add((r["home"], r["away"]))
        if code == our_code:
            our_rounds, our_extras = rounds, extras
    teams = sorted(n for n in team_opts.values() if n.lower() != "bye")

    # --- results + scoresheets (re-use stored scoresheets unless --refetch)
    res_page = fetch(f"results.php?daytime={DAYTIME}&section={sec}&style=")
    loaded = re.search(r"\d+\w{2} \w+ \d{2} @ [\d:]+ [AP]M", res_page)
    prev = {}
    for r in old.get("results", []):
        for m in r["matches"]:
            if m.get("matchId"):
                prev[m["matchId"]] = m
    results = []
    for rnd in sorted(parse_results(res_page), key=lambda r: (str(type(r["round"])), r["round"])):
        for m in rnd["matches"]:
            p = prev.get(m["matchId"])
            if p and p.get("rubbers") and not refetch:
                for k in ("homePlayers", "awayPlayers", "homeEmergencies", "awayEmergencies", "rubbers"):
                    m[k] = p.get(k, [])
            elif m["matchId"]:
                home, away, rr, totals = parse_match(fetch(f"match_popup.php?matchid={m['matchId']}&seasonid="))
                m["homePlayers"] = [alias(n) for _, _, _, n in sorted(home, key=lambda x: x[2])]
                m["awayPlayers"] = [alias(n) for _, _, _, n in sorted(away, key=lambda x: x[2])]
                m["homePositions"] = {alias(n): i for _, _, i, n in home}
                m["awayPositions"] = {alias(n): i for _, _, i, n in away}
                m["homeEmergencies"] = [alias(n) for _, e, _, n in home if e]
                m["awayEmergencies"] = [alias(n) for _, e, _, n in away if e]
                m["rubbers"] = build_rubbers(home, away, rr, alias)
                if totals:
                    fix_incomplete_rubbers(m["rubbers"], totals["homeR"])
                    if m.get("homeR") is None:
                        m["homeR"], m["awayR"] = totals["homeR"], totals["awayR"]
                    if (totals["homeS"], totals["awayS"]) != (m["homeS"], m["awayS"]):
                        print(f"  ! {m['matchId']} set totals differ (sheet {totals['homeS']}-{totals['awayS']}, results {m['homeS']}-{m['awayS']})")
            for k in ("homeR", "awayR"):
                if m.get(k) is None:
                    m[k] = sum(1 for x in m.get("rubbers", []) if x["winner"] == ("home" if k == "homeR" else "away"))
        results.append(rnd)

    # --- clubs (venues): keep hand-entered court type / notes
    old_clubs = {c["name"]: c for c in old.get("clubs", [])}
    court_by_addr = club_manual.get("courtTypes", {})
    clubs = []
    for name in teams:
        v = venues.get(name, {"name": name})
        o = old_clubs.get(name, {})
        clubs.append({
            "id": slugify(name), "name": name, "melway": v.get("melway", ""), "address": v.get("address", ""),
            "courtType": o.get("courtType") or court_by_addr.get(v.get("address", ""), ""),
            "clubhousePhone": v.get("clubhousePhone", ""), "contactName": v.get("contactName", ""),
            "contactPhone": v.get("contactPhone", ""), "notes": o.get("notes", ""),
        })

    # --- our schedule (incl. byes, No Play, breaks, finals)
    sched = []
    for r in our_rounds:
        bye = "Bye" in (r["home"], r["away"])
        sched.append({"round": r["round"], "date": r["date"], "home": None if bye else r["home"],
                      "away": None if bye else r["away"], "byeDate": bye, **({"note": "Bye"} if bye else {})})
    for e in our_extras:
        if e.get("finals"):
            rd = "SF" if "Semi" in e["note"] else "GF" if "Grand" in e["note"] else "PF" if "Prelim" in e["note"] else None
            sched.append({"round": rd, "date": e["date"], "home": None, "away": None, "byeDate": False, "note": e["note"]})
        else:
            sched.append({"round": None, "date": e["date"], "home": None, "away": None, "byeDate": True, "note": e["note"]})
    sched.sort(key=lambda s: s["date"])
    played_rounds = [s for s in sched if isinstance(s["round"], int)]
    for a, b in zip(played_rounds, played_rounds[1:]):
        gap = (dt.date.fromisoformat(b["date"]) - dt.date.fromisoformat(a["date"])).days
        if gap > 21:
            mid = (dt.date.fromisoformat(a["date"]) + dt.timedelta(days=7)).isoformat()
            if not any(s["date"] == mid for s in sched):
                nice = dt.date.fromisoformat(b["date"]).strftime("%-d %b %y")
                sched.append({"round": None, "date": mid, "home": None, "away": None, "byeDate": True,
                              "note": f"Christmas break — resumes {nice}" if a["date"][5:7] == "12" else f"Break — resumes {nice}"})
    sched.sort(key=lambda s: s["date"])

    finals = {e["note"]: e["date"] for e in our_extras if e.get("finals")}
    remaining = {
        "asOfDate": dt.date.today().isoformat(),
        "note": f"Full fixture for all {len(teams)} teams in {section_name}, from trols.org.au.",
        "rounds": [{"round": rd, "date": d, "matches": [{"home": h, "away": a} for h, a in sorted(ms) if "Bye" not in (h, a)]}
                   for (rd, d), ms in sorted(all_rounds.items())],
        "finals": {"semiFinal": finals.get("Semi Final"), "grandFinal": finals.get("Grand Final"),
                   "note": "Top 4 make finals; 1st and 2nd host the semi final."},
    }

    # --- rosters from scoresheets
    seen = {}  # (team, name) -> {"positions":[], "e": n, "apps": n}
    for rnd in results:
        for m in rnd["matches"]:
            for side in ("home", "away"):
                team = m[side]
                pos = m.get(f"{side}Positions") or {n: i + 1 for i, n in enumerate(m.get(f"{side}Players", []))}
                for n in m.get(f"{side}Players", []):
                    s = seen.setdefault((team, n), {"positions": [], "e": 0, "apps": 0})
                    s["apps"] += 1
                    if n in m.get(f"{side}Emergencies", []):
                        s["e"] += 1
                    else:
                        s["positions"].append(pos.get(n))
    team_rosters = {}
    for (team, n), s in seen.items():
        if team == CLUB:
            continue
        team_rosters.setdefault(team, []).append({
            "name": n, "order": most_common([p for p in s["positions"] if p]), "emergency": s["e"] == s["apps"], "played": s["apps"]})
    for t in team_rosters.values():
        t.sort(key=lambda p: (p["emergency"], p["order"] or 99, p["name"]))

    old_roster = {alias(p["name"]): p for p in old.get("roster", [])}
    roster = []
    blank = {"mobile": "", "email": "", "gender": "", "dob": "", "grade": "", "utrId": None, "utrSingles": None,
             "utrSinglesReliability": None, "utrDoubles": None, "utrDoublesReliability": None}
    names = list(old_roster) + [n for (t, n) in seen if t == CLUB and n not in old_roster]
    for n in names:
        s = seen.get((CLUB, n), {"positions": [], "e": 0, "apps": 0})
        p = {**blank, **old_roster.get(n, {}), "name": n}
        p["played"] = s["apps"]
        p["emergencyApps"] = s["e"]
        if n not in old_roster:
            p["order"] = most_common([x for x in s["positions"] if x])
            p["emergency"] = s["apps"] > 0 and s["e"] == s["apps"]
        roster.append(p)
    roster.sort(key=lambda p: (bool(p.get("emergency")), p.get("order") or 99, p["name"]))

    meta = {**old.get("meta", {})}
    meta.update({
        "club": CLUB, "slug": slug, "label": cfg["label"], "competition": comp, "section": section_name,
        "sectionCode": sec, "teamCode": our_code, "ourTeam": CLUB,
        "lastUpdated": dt.date.today().isoformat(), "resultsLoadedFromSite": loaded.group(0) if loaded else "",
        "sourceUrl": f"{BASE}results.php?daytime={DAYTIME}&section={sec}&style=",
        "fixtureUrl": f"{BASE}fixture.php?daytime={DAYTIME}&section={sec}&style=",
        "dataPath": f"teams/{slug}/data.json",
    })
    meta.setdefault("playersNeeded", 4 if "Rubbers" in section_name else 3)
    meta.setdefault("overridesKey", f"berwickComp_{sec}_overrides_v1")

    data = {
        "meta": meta, "teams": teams, "clubs": clubs, "roster": roster, "schedule": sched,
        "results": results, "teamRosters": team_rosters, "remainingFixtures": remaining,
        "playerAliases": old.get("playerAliases", {}), "playerNotes": old.get("playerNotes", {}),
        "availability": old.get("availability", {}), "lineups": old.get("lineups", {}),
    }
    write_site_data(folder, data)
    # every team page is the same shell; refresh it from the template each run
    with open(os.path.join(ROOT, "tools", "team_template.html")) as src, open(os.path.join(folder, "index.html"), "w") as dst:
        dst.write(src.read())
    print(f"  {slug}: {section_name} — {len(teams)} teams, {len(results)} rounds, roster {len(roster)}")
    return data


# ---------------------------------------------------------------- club hub data

def build_club(team_data, club_old):
    manual = club_old.get("manual", {})
    home_override = manual.get("playerHomeTeam", {})
    limit = club_old.get("emergencyLimit", 3)
    players = {}
    for cfg in TEAMS:
        d = team_data.get(cfg["slug"])
        if not d:
            continue
        for rnd in d["results"]:
            for m in rnd["matches"]:
                for side in ("home", "away"):
                    if m[side] != CLUB:
                        continue
                    opp = m["away" if side == "home" else "home"]
                    for n in m.get(f"{side}Players", []):
                        p = players.setdefault(n, {"name": n, "apps": {}, "regularApps": {}, "emergencies": []})
                        p["apps"][cfg["slug"]] = p["apps"].get(cfg["slug"], 0) + 1
                        if n in m.get(f"{side}Emergencies", []):
                            p["emergencies"].append({"date": rnd["date"], "round": rnd["round"], "team": cfg["slug"],
                                                     "opponent": opp, "source": "scoresheet"})
                        else:
                            p["regularApps"][cfg["slug"]] = p["regularApps"].get(cfg["slug"], 0) + 1
    for e in manual.get("emergencies", []):
        p = players.setdefault(e["player"], {"name": e["player"], "apps": {}, "regularApps": {}, "emergencies": []})
        if not any(x["date"] == e["date"] and x["team"] == e["team"] for x in p["emergencies"]):
            p["emergencies"].append({**{k: v for k, v in e.items() if k != "player"}, "source": "manual"})
    for n, p in players.items():
        if n in home_override:
            p["homeTeam"], p["homeTeamSource"] = home_override[n], "manual"
        elif p["regularApps"]:
            p["homeTeam"], p["homeTeamSource"] = max(p["regularApps"], key=p["regularApps"].get), "scoresheet"
        else:
            p["homeTeam"], p["homeTeamSource"] = None, None
        # an "E" in your own team's sheet isn't an emergency appearance for another team
        p["emergencies"] = sorted([e for e in p["emergencies"] if e["team"] != p["homeTeam"]], key=lambda e: e["date"])
        p["emergencyCount"] = len(p["emergencies"])
        p["emergencyStatus"] = "over" if p["emergencyCount"] > limit else "limit" if p["emergencyCount"] == limit else \
            "warn" if p["emergencyCount"] == limit - 1 else "ok"
    first = next(iter(team_data.values()))
    club = {
        "club": CLUB, "competition": first["meta"]["competition"], "lastUpdated": dt.date.today().isoformat(),
        "resultsLoadedFromSite": first["meta"].get("resultsLoadedFromSite", ""),
        "emergencyLimit": limit,
        "emergencyRule": club_old.get("emergencyRule",
                                      "WDTA: a player may play as an emergency for another team up to 3 times a season; "
                                      "more than that and they can no longer play in their own section."),
        "teams": [{**cfg, "sectionName": team_data[cfg["slug"]]["meta"]["section"], "path": f"teams/{cfg['slug']}/"}
                  for cfg in TEAMS if cfg["slug"] in team_data],
        "archives": club_old.get("archives", [{"label": "Winter 2026 — A Reserve 4", "path": "winter-2026/"}]),
        "players": dict(sorted(players.items())),
        "manual": {"playerHomeTeam": home_override, "emergencies": manual.get("emergencies", []),
                   "playerAliases": manual.get("playerAliases", {}), "courtTypes": manual.get("courtTypes", {}),
                   "_help": "Edit this block by hand (or ask Claude). playerHomeTeam: {\"Name\": \"slug\"}; "
                            "emergencies: [{\"player\",\"date\":\"YYYY-MM-DD\",\"team\":\"slug\",\"opponent\",\"note\"}]."},
    }
    write_site_data(ROOT, club, var="CLUB_DATA")
    return club


def main():
    args = sys.argv[1:]
    if "--discover" in args:
        page = fetch(f"fixture.php?daytime={DAYTIME}&style=")
        for code, name in parse_options(page, "section").items():
            p = fetch(f"fixture.php?daytime={DAYTIME}&section={code}&style=")
            if CLUB in parse_options(p, "team").values():
                print(code, name)
        return
    only = args[args.index("--only") + 1] if "--only" in args else None
    club_old = load_json(os.path.join(ROOT, "club.json"), {})
    team_data = {}
    for cfg in TEAMS:
        if only and cfg["slug"] != only:
            team_data[cfg["slug"]] = load_json(os.path.join(ROOT, "teams", cfg["slug"], "data.json"), None)
            if team_data[cfg["slug"]] is None:
                del team_data[cfg["slug"]]
            continue
        print(f"Syncing {cfg['label']} ({cfg['section']})…")
        team_data[cfg["slug"]] = sync_team(cfg, club_old.get("manual", {}), refetch="--refetch" in args)
    club = build_club(team_data, club_old)
    em = [p for p in club["players"].values() if p["emergencyCount"]]
    print(f"Club: {len(club['players'])} players, {len(em)} with emergency appearances")


if __name__ == "__main__":
    main()
