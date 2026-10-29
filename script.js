/* Berwick Tennis Club — team page logic, shared by every team under teams/<slug>/ (club hub: index.html + hub.js).
   Archived seasons keep their own copy (e.g. winter-2026/). */

function overridesKey() {
  const m = (window.SITE_DATA && window.SITE_DATA.meta) || {};
  return m.overridesKey || `berwickComp_${m.sectionCode || "team"}_overrides_v1`;
}
const PREV_OVERRIDES_KEY = "berwickComp_overrides_v1"; // Winter 2026 (archived) — roster UTR/contact edits carried over once
const PAT_KEY = "berwickComp_ghPat";
const OUR_TEAM = "Berwick";

let DATA = null;
let OVERRIDES = null;

function loadOverrides() {
  // Seed playerNotes from data.json (committed notes available on all devices)
  const siteNotes = (window.SITE_DATA && window.SITE_DATA.playerNotes) || {};
  try {
    let raw = localStorage.getItem(overridesKey());
    let parsed = raw ? JSON.parse(raw) : null;
    if (!parsed) {
      // First visit this season: carry over roster edits (UTR, mobile, email) and player notes from last season
      const prev = (window.SITE_DATA.meta.sectionCode === "AP020") ? JSON.parse(localStorage.getItem(PREV_OVERRIDES_KEY) || "{}") : {};
      parsed = { roster: prev.roster || {}, clubs: {}, playerNotes: prev.playerNotes || {} };
    }
    // Merge: site notes are the base, local edits (localStorage) sit on top
    return {
      roster: {},
      clubs: {},
      ...parsed,
      playerNotes: { ...siteNotes, ...(parsed.playerNotes || {}) }
    };
  } catch (e) {
    return { roster: {}, clubs: {}, playerNotes: { ...siteNotes } };
  }
}

function saveOverrides() {
  localStorage.setItem(overridesKey(), JSON.stringify(OVERRIDES));
}

/* ---------------- Save notes to GitHub (cross-device persistence) ---------------- */

async function saveNotesToGitHub() {
  const btn = document.getElementById("save-to-site-btn");
  const statusEl = document.getElementById("save-to-site-status");

  // Get or prompt for PAT
  let pat = localStorage.getItem(PAT_KEY);
  if (!pat) {
    pat = prompt(
      "Enter your GitHub Personal Access Token to save notes to the site.\n" +
      "This token is stored only in this browser — it is never sent anywhere except GitHub.\n\n" +
      "(You can find it in Settings → Berwick tab → Configure token if you need to change it)"
    );
    if (!pat) return;
    localStorage.setItem(PAT_KEY, pat.trim());
    pat = pat.trim();
  }

  const repo = "Berwick-Tennis/berwick-tennis.github.io";
  const filePath = (DATA.meta && DATA.meta.dataPath) || "data.json";
  const apiBase = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const headers = { "Authorization": `token ${pat}`, "Content-Type": "application/json" };

  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  if (statusEl) statusEl.textContent = "";

  try {
    // Fetch current file SHA
    const getRes = await fetch(apiBase, { headers });
    if (getRes.status === 401) {
      localStorage.removeItem(PAT_KEY);
      if (btn) { btn.disabled = false; btn.textContent = "☁️ Save to site"; }
      alert("GitHub token rejected — please try again.");
      return;
    }
    if (!getRes.ok) throw new Error(`GitHub GET failed: ${getRes.status}`);
    const fileData = await getRes.json();
    const sha = fileData.sha;

    // Decode, merge notes in
    const current = JSON.parse(decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, "")))));
    current.playerNotes = OVERRIDES.playerNotes;
    const jsonStr = JSON.stringify(current, null, 2);
    const jsStr = "window.SITE_DATA = " + jsonStr + ";\n";

    // Commit data.json
    const encodedJson = btoa(unescape(encodeURIComponent(jsonStr)));
    const putRes = await fetch(apiBase, {
      method: "PUT",
      headers,
      body: JSON.stringify({ message: "Update player notes", content: encodedJson, sha })
    });
    if (!putRes.ok) throw new Error(`GitHub PUT data.json failed: ${putRes.status}`);

    // Also commit data.js (the file the site actually loads)
    const jsApiBase = `https://api.github.com/repos/${repo}/contents/${filePath.replace(/\.json$/, ".js")}`;
    const getJs = await fetch(jsApiBase, { headers });
    if (!getJs.ok) throw new Error(`GitHub GET data.js failed: ${getJs.status}`);
    const jsFile = await getJs.json();
    const encodedJs = btoa(unescape(encodeURIComponent(jsStr)));
    const putJs = await fetch(jsApiBase, {
      method: "PUT",
      headers,
      body: JSON.stringify({ message: "Update player notes (data.js)", content: encodedJs, sha: jsFile.sha })
    });
    if (!putJs.ok) throw new Error(`GitHub PUT data.js failed: ${putJs.status}`);

    // Keep SITE_DATA in sync so next loadOverrides() doesn't double-apply old data
    if (window.SITE_DATA) window.SITE_DATA.playerNotes = { ...OVERRIDES.playerNotes };

    if (btn) { btn.disabled = false; btn.textContent = "☁️ Save to site"; }
    if (statusEl) { statusEl.textContent = "✓ Saved"; setTimeout(() => { statusEl.textContent = ""; }, 3000); }
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = "☁️ Save to site"; }
    alert("Save failed: " + err.message);
  }
}

function applyOverrides() {
  // roster overrides (UTR + contact details)
  DATA.roster.forEach(p => {
    const o = OVERRIDES.roster[p.name];
    if (o) {
      if (o.utrSingles !== undefined) p.utrSingles = o.utrSingles;
      if (o.utrDoubles !== undefined) p.utrDoubles = o.utrDoubles;
      if (o.mobile !== undefined) p.mobile = o.mobile;
      if (o.email !== undefined) p.email = o.email;
    }
  });
  // Venue details are read-only (no per-browser overrides any more)
}

/* ---------------- Player notes (used on Players tab) ---------------- */

function playerNoteKey(team, name) {
  return `${team}::${name}`;
}

function getPlayerNote(team, name) {
  const key = playerNoteKey(team, name);
  return OVERRIDES.playerNotes[key] || { plays: "", serving: "", generalPlay: "", strengths: "", weaknesses: "" };
}

function savePlayerNote(team, name, field, value) {
  const key = playerNoteKey(team, name);
  OVERRIDES.playerNotes[key] = OVERRIDES.playerNotes[key] || { plays: "", serving: "", generalPlay: "", strengths: "", weaknesses: "" };
  OVERRIDES.playerNotes[key][field] = value;
  saveOverrides();
}

function slug(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/* ---------------- Availability ---------------- */

// DATA.availability = { "YYYY-MM-DD": { "Player Name": { status: "out" | "maybe", note: "" } } }
// Anyone on the roster not listed for a date is assumed available.
// Regular team members (emergency fill-ins from other teams aren't part of availability)
function regulars() {
  return DATA.roster.filter(p => !p.emergency);
}

function playersNeeded() {
  return (DATA.meta && DATA.meta.playersNeeded) || 3;
}

function availabilityFor(date) {
  const byDate = (DATA.availability && DATA.availability[date]) || {};
  const roster = regulars().sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const out = { available: [], maybe: [], out: [] };
  roster.forEach(p => {
    const entry = byDate[p.name];
    const status = entry ? entry.status : "available";
    const item = { name: p.name, note: entry && entry.note ? entry.note : "" };
    (out[status === "out" ? "out" : status === "maybe" ? "maybe" : "available"]).push(item);
  });
  return out;
}

function firstName(name) {
  return (name || "").split(" ")[0];
}

function availabilityChips(date, opts = {}) {
  const a = availabilityFor(date);
  const need = playersNeeded();
  const confirmed = a.available.length;
  const status = confirmed >= need ? "ok" : confirmed + a.maybe.length >= need ? "warn" : "short";
  const label = opts.full ? (n => escapeHtml(n)) : (n => escapeHtml(firstName(n)));
  const chip = (p, cls, prefix) => `<span class="avail-chip ${cls}" title="${escapeAttr(p.name + (p.note ? " — " + p.note : ""))}">${prefix}${label(p.name)}</span>`;
  if (opts.compact) {
    const bits = [];
    if (a.out.length) bits.push(`<span class="avail-note no">Out: ${a.out.map(p => escapeHtml(firstName(p.name))).join(", ")}</span>`);
    if (a.maybe.length) bits.push(`<span class="avail-note maybe">TBC: ${a.maybe.map(p => escapeHtml(firstName(p.name))).join(", ")}</span>`);
    if (!bits.length) bits.push(`<span class="avail-note muted">All available</span>`);
    return `<div class="avail-compact" title="${escapeAttr("Available: " + a.available.map(p => p.name).join(", "))}"><span class="avail-count ${status}">${confirmed}/${regulars().length}</span> ${bits.join(" ")}</div>`;
  }
  return `
    <div class="avail-wrap">
      <span class="avail-count ${status}" title="${confirmed} confirmed of ${regulars().length}; ${need} needed">${confirmed}/${regulars().length}</span>
      ${a.available.map(p => chip(p, "yes", "")).join("")}
      ${a.maybe.map(p => chip(p, "maybe", "? ")).join("")}
      ${a.out.map(p => chip(p, "no", "")).join("")}
    </div>`;
}

// Rows of the schedule where Berwick actually plays (incl. finals placeholders)
function playingDates() {
  return DATA.schedule.filter(s => !s.byeDate && ((s.home === OUR_TEAM || s.away === OUR_TEAM) || (!s.home && !s.away && s.note)));
}

function renderAvailabilityGrid() {
  const el = document.getElementById("availability-grid");
  if (!el) return;
  const roster = regulars().sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const today = todayISO();
  const rows = playingDates().map(s => {
    const byDate = (DATA.availability && DATA.availability[s.date]) || {};
    const a = availabilityFor(s.date);
    const need = playersNeeded();
    const status = a.available.length >= need ? "ok" : a.available.length + a.maybe.length >= need ? "warn" : "short";
    const opp = s.home === OUR_TEAM ? `v ${s.away}` : s.away === OUR_TEAM ? `@ ${s.home}` : (s.note || "");
    return `<tr class="${s.date < today ? "past-row" : ""}${s.date === nextMatchDate() ? " us-row" : ""}">
      <td>${s.round ?? ""}</td>
      <td>${fmtDate(s.date)}</td>
      <td>${escapeHtml(opp)}</td>
      ${roster.map(p => {
        const e = byDate[p.name];
        const st = e ? e.status : "available";
        const sym = st === "out" ? "✗" : st === "maybe" ? "?" : "✓";
        return `<td class="avail-cell ${st === "out" ? "no" : st === "maybe" ? "maybe" : "yes"}" title="${escapeAttr(p.name + (e && e.note ? " — " + e.note : ""))}">${sym}</td>`;
      }).join("")}
      <td><span class="avail-count ${status}">${a.available.length}/${roster.length}</span></td>
    </tr>`;
  }).join("");
  el.innerHTML = `
    <div class="table-wrap">
    <table class="avail-table">
      <thead><tr><th>Rd</th><th>Date</th><th>Match</th>${roster.map(p => `<th title="${escapeAttr(p.name)}">${escapeHtml(firstName(p.name))}</th>`).join("")}<th>Avail</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
    <p class="muted" style="margin-top:0.5rem;">✓ available &middot; ? unconfirmed &middot; ✗ unavailable. Count is confirmed players out of ${roster.length}; we need ${playersNeeded()} each week (amber = only enough if unconfirmed players can play, red = short). Hover a cell for notes. Tell Claude when someone's availability changes and it will update this for everyone.</p>
  `;
}

// DATA.lineups = { "YYYY-MM-DD": { singles1: "Name", singles2: "Name", doubles: ["Name", "Name"] } }
function lineupBlock(date) {
  const l = DATA.lineups && DATA.lineups[date];
  const name = n => n ? escapeHtml(n) : `<span class="muted">TBC</span>`;
  const rows = l ? [
    ["Singles 1", name(l.singles1)],
    ["Singles 2", name(l.singles2)],
    ["Doubles", l.doubles && l.doubles.length ? l.doubles.map(escapeHtml).join(" &amp; ") : name(null)]
  ] : null;
  // Everyone on the roster who isn't in the line-up, with their availability note if any
  const picked = l ? [l.singles1, l.singles2, ...(l.doubles || [])].filter(Boolean) : [];
  const byDate = (DATA.availability && DATA.availability[date]) || {};
  const others = l ? [...DATA.roster]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .filter(p => !picked.includes(p.name) && !p.emergency)
    .map(p => {
      const e = byDate[p.name];
      const status = e ? (e.status === "out" ? (e.note || "Unavailable") : `TBC${e.note ? " — " + e.note : ""}`) : "Reserve";
      const cls = e ? (e.status === "out" ? "no" : "maybe") : "reserve";
      return `<div class="lineup-row lineup-out ${cls}"><span class="lineup-slot">Not playing</span><span class="lineup-name">${escapeHtml(p.name)} <span class="lineup-reason">— ${escapeHtml(status)}</span></span></div>`;
    }) : [];
  return `
    <div class="lineup-block">
      <div class="label">Roster</div>
      ${rows ? `<div class="lineup-rows">${rows.map(([k, v]) => `<div class="lineup-row"><span class="lineup-slot">${k}</span><span class="lineup-name">${v}</span></div>`).join("")}${others.length ? `<div class="lineup-divider"></div>${others.join("")}` : ""}</div>`
             : `<span class="muted">Not set yet</span>`}
    </div>`;
}

/* ---------------- Ladder computation ---------------- */

function computeLadder() {
  const teams = {};
  function ensure(name) {
    if (!teams[name]) {
      teams[name] = { team: name, played: 0, pts: 0, rFor: 0, rAgainst: 0, sFor: 0, sAgainst: 0, gFor: 0, gAgainst: 0, form: [] };
    }
    return teams[name];
  }

  (DATA.teams || []).forEach(ensure);

  DATA.results.forEach(round => {
    round.matches.forEach(m => {
      const h = ensure(m.home);
      const a = ensure(m.away);
      h.played++; a.played++;
      h.pts += m.homePts; a.pts += m.awayPts;
      h.rFor += m.homeR; h.rAgainst += m.awayR;
      a.rFor += m.awayR; a.rAgainst += m.homeR;
      h.sFor += m.homeS; h.sAgainst += m.awayS;
      a.sFor += m.awayS; a.sAgainst += m.homeS;
      h.gFor += m.homeG; h.gAgainst += m.awayG;
      a.gFor += m.awayG; a.gAgainst += m.homeG;
      h.form.push({ round: round.round, result: m.homePts > m.awayPts ? "W" : "L", opponent: m.away, pts: m.homePts, oppPts: m.awayPts });
      a.form.push({ round: round.round, result: m.awayPts > m.homePts ? "W" : "L", opponent: m.home, pts: m.awayPts, oppPts: m.homePts });
    });
  });

  const list = Object.values(teams).map(t => {
    const gamePct = t.gFor + t.gAgainst > 0 ? t.gFor / (t.gFor + t.gAgainst) : 0;
    const setPct = t.sFor + t.sAgainst > 0 ? t.sFor / (t.sFor + t.sAgainst) : 0;
    return { ...t, gamePct, setPct };
  });

  list.sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (y.setPct !== x.setPct) return y.setPct - x.setPct;
    if (y.gamePct !== x.gamePct) return y.gamePct - x.gamePct;
    return x.team.localeCompare(y.team);
  });

  list.forEach((t, i) => t.position = i + 1);
  return list;
}

// Cumulative ladder points per team, snapshotted after each round — used for the Results progression chart.
function computeLadderProgression() {
  const rounds = [...DATA.results].sort((a, b) => a.round - b.round);
  const totals = {};
  const progression = {};
  const roundNumbers = rounds.map(r => r.round);

  rounds.forEach((round, idx) => {
    round.matches.forEach(m => {
      totals[m.home] = (totals[m.home] || 0) + m.homePts;
      totals[m.away] = (totals[m.away] || 0) + m.awayPts;
    });
    Object.keys(totals).forEach(team => {
      if (!progression[team]) progression[team] = new Array(idx).fill(0);
    });
    Object.keys(progression).forEach(team => {
      progression[team].push(totals[team] || 0);
    });
  });

  return { rounds: roundNumbers, teams: progression };
}

// Strength-of-remaining-schedule: for every team, look up its unplayed rounds
// (DATA.remainingFixtures minus anything already in DATA.results) and average
// the current ladder points of the opponents still to come. Lower = easier run home.
function computeRemainingStrength() {
  const ladder = computeLadder();
  const ladderByTeam = {};
  ladder.forEach(t => {
    ladderByTeam[t.team] = t;
    ladderByTeam[t.team.replace(" U/C", "")] = t;
  });
  function findLadder(name) {
    return ladderByTeam[name] || ladderByTeam[name.replace(" U/C", "")];
  }

  const playedRounds = new Set(DATA.results.map(r => r.round));
  const remainingRounds = ((DATA.remainingFixtures && DATA.remainingFixtures.rounds) || [])
    .filter(rnd => !playedRounds.has(rnd.round));

  const perTeam = {};
  ladder.forEach(t => { perTeam[t.team] = { team: t.team, ladder: t, games: [] }; });

  remainingRounds.forEach(rnd => {
    rnd.matches.forEach(m => {
      const homeOppLadder = findLadder(m.away);
      const awayOppLadder = findLadder(m.home);
      if (perTeam[m.home]) perTeam[m.home].games.push({ round: rnd.round, date: rnd.date, opponent: m.away, venue: "home", oppLadder: homeOppLadder });
      if (perTeam[m.away]) perTeam[m.away].games.push({ round: rnd.round, date: rnd.date, opponent: m.home, venue: "away", oppLadder: awayOppLadder });
    });
  });

  const list = Object.values(perTeam).map(t => {
    const valid = t.games.filter(g => g.oppLadder);
    const avgOppPts = valid.length ? valid.reduce((s, g) => s + g.oppLadder.pts, 0) / valid.length : null;
    return { ...t, avgOppPts };
  });

  list.sort((a, b) => {
    if (a.avgOppPts === null && b.avgOppPts === null) return 0;
    if (a.avgOppPts === null) return 1;
    if (b.avgOppPts === null) return -1;
    return a.avgOppPts - b.avgOppPts;
  });

  return list;
}

/* ---------------- Player stats computation ---------------- */

function gamesPctCell(t) {
  const tot = t.gamesFor + t.gamesAgainst;
  return tot > 0 ? `${((t.gamesFor / tot) * 100).toFixed(0)}%` : `<span class="muted">-</span>`;
}

function canonName(name) {
  const a = (DATA && DATA.playerAliases) || {};
  return a[name] || name;
}

function computePlayerStats() {
  const players = {};

  function ensure(name, team) {
    name = canonName(name);
    if (!players[name]) {
      players[name] = {
        name, team,
        played: 0, wins: 0, losses: 0,
        setsFor: 0, setsAgainst: 0,
        gamesFor: 0, gamesAgainst: 0,
        singles: { played: 0, wins: 0, losses: 0, gamesFor: 0, gamesAgainst: 0 },
        doubles: { played: 0, wins: 0, losses: 0, gamesFor: 0, gamesAgainst: 0 },
        form: []
      };
    }
    return players[name];
  }

  // Always list our own roster, even before they've played a rubber
  (DATA.roster || []).forEach(p => ensure(p.name, OUR_TEAM));

  DATA.results.forEach(round => {
    round.matches.forEach(m => {
      (m.rubbers || []).forEach(r => {
        const homeWon = r.winner === "home";
        const sides = [
          { names: r.homePlayers, team: m.home, won: homeWon, setsFor: r.homeSets, setsAgainst: r.awaySets, gamesFor: r.homeGames, gamesAgainst: r.awayGames, oppNames: r.awayPlayers, oppTeam: m.away, isHome: true },
          { names: r.awayPlayers, team: m.away, won: !homeWon, setsFor: r.awaySets, setsAgainst: r.homeSets, gamesFor: r.awayGames, gamesAgainst: r.homeGames, oppNames: r.homePlayers, oppTeam: m.home, isHome: false }
        ];
        sides.forEach(side => {
          side.names.forEach(rawName => {
            const name = canonName(rawName);
            const p = ensure(name, side.team);
            p.played++;
            if (side.won) p.wins++; else p.losses++;
            p.setsFor += side.setsFor;
            p.setsAgainst += side.setsAgainst;
            p.gamesFor += side.gamesFor;
            p.gamesAgainst += side.gamesAgainst;
            const typeStats = r.type === "singles" ? p.singles : p.doubles;
            typeStats.played++;
            typeStats.gamesFor += side.gamesFor;
            typeStats.gamesAgainst += side.gamesAgainst;
            if (side.won) typeStats.wins++; else typeStats.losses++;
            const partner = side.names.map(canonName).filter(n => n !== name)[0] || null;
            const score = r.sets.map(s => side.isHome ? `${s[0]}-${s[1]}` : `${s[1]}-${s[0]}`).join(", ");
            p.form.push({
              round: round.round, type: r.type, result: side.won ? "W" : "L",
              partner, opponents: side.oppNames, opponentTeam: side.oppTeam, score
            });
          });
        });
      });
    });
  });

  return Object.values(players).map(p => {
    const winPct = p.played > 0 ? p.wins / p.played : 0;
    return { ...p, winPct };
  }).sort((a, b) => {
    if (a.team === OUR_TEAM && b.team !== OUR_TEAM) return -1;
    if (b.team === OUR_TEAM && a.team !== OUR_TEAM) return 1;
    if (a.team !== b.team) return a.team.localeCompare(b.team);
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    return b.played - a.played;
  });
}

/* ---------------- Sortable tables ---------------- */

const SORT_STATE = {}; // table key -> { col, dir }

function sortValue(txt) {
  const t = (txt || "").trim();
  if (!t || t === "-") return null;
  const m = t.match(/^(-?\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : t.toLowerCase();
}

function makeSortable(table, key) {
  if (!table) return;
  const ths = [...table.tHead.rows[0].cells];
  const tbody = table.tBodies[0];
  const apply = () => {
    const st = SORT_STATE[key];
    ths.forEach((th, i) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (st && st.col === i) th.classList.add(st.dir === 1 ? "sorted-asc" : "sorted-desc");
    });
    if (!st) return;
    const rows = [...tbody.rows];
    rows.sort((ra, rb) => {
      const a = sortValue(ra.cells[st.col].textContent), b = sortValue(rb.cells[st.col].textContent);
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      if (typeof a === "number" && typeof b === "number") return (a - b) * st.dir;
      return String(a).localeCompare(String(b)) * st.dir;
    });
    rows.forEach(r => tbody.appendChild(r));
  };
  ths.forEach((th, i) => {
    if (th.hasAttribute("data-nosort") || !th.textContent.trim()) return;
    th.classList.add("sortable");
    th.addEventListener("click", () => {
      const st = SORT_STATE[key];
      // First click: numbers descending (best first), text ascending
      const first = [...tbody.rows].map(r => sortValue(r.cells[i].textContent)).find(v => v !== null);
      const startDir = typeof first === "number" ? -1 : 1;
      SORT_STATE[key] = st && st.col === i ? { col: i, dir: -st.dir } : { col: i, dir: startDir };
      apply();
    });
  });
  apply();
}

/* ---------------- Players tab ---------------- */

function renderPlayers() {
  const select = document.getElementById("players-team");

  if (!select.dataset.initialized) {
    const teams = [OUR_TEAM, ...DATA.clubs.filter(c => c.name !== OUR_TEAM).map(c => c.name)];
    select.innerHTML = `<option value="all">All teams</option>` + teams.map(t => `<option value="${escapeAttr(t)}">${t}</option>`).join("");
    select.value = OUR_TEAM;
    select.dataset.initialized = "1";
    select.addEventListener("change", renderPlayers);
  }

  const stats = computePlayerStats();
  const filterTeam = select.value;
  let rows = filterTeam === "all" ? stats : stats.filter(p => p.team === filterTeam);
  if (filterTeam === "all") {
    rows = [...rows].sort((a, b) => {
      if (a.team !== b.team) {
        if (a.team === OUR_TEAM) return -1;
        if (b.team === OUR_TEAM) return 1;
        return a.team.localeCompare(b.team);
      }
      return byRosterOrder(a.team)(a, b);
    });
  } else {
    rows = [...rows].sort(byRosterOrder(filterTeam));
  }
  const el = document.getElementById("players-table");
  const showTeamCol = filterTeam === "all";

  el.innerHTML = `
    <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th data-nosort></th><th>Order</th><th>Player</th>${showTeamCol ? "<th>Team</th>" : ""}<th>W-L</th><th>Win %</th>
          <th>Singles</th><th>Doubles</th><th>Games % S</th><th>Games % D</th><th>Sets</th><th>Games</th><th data-nosort>Form</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(p => {
          const roster = p.team === OUR_TEAM ? rosterByName(p.name) : null;
          const info = getPlayerOrderInfo(p.team, p.name);
          return `
          <tr class="${p.team === OUR_TEAM ? "us-row" : ""}">
            <td>${info.emergency ? `<span class="badge-e" title="Emergency player">E</span>` : ""}</td>
            <td>${info.order ?? "-"}</td>
            <td><button class="player-link" data-team="${escapeAttr(p.team)}" data-name="${escapeAttr(p.name)}">${escapeHtml(p.name)}</button></td>
            ${showTeamCol ? `<td>${escapeHtml(p.team)}</td>` : ""}
            <td>${p.wins}-${p.losses}</td>
            <td>${(p.winPct * 100).toFixed(0)}%</td>
            <td>${p.singles.played ? `${p.singles.wins}-${p.singles.losses}` : `<span class="muted">-</span>`}</td>
            <td>${p.doubles.played ? `${p.doubles.wins}-${p.doubles.losses}` : `<span class="muted">-</span>`}</td>
                        <td>${gamesPctCell(p.singles)}</td>
            <td>${gamesPctCell(p.doubles)}</td>
            <td>${p.setsFor}-${p.setsAgainst}</td>
            <td>${p.gamesFor}-${p.gamesAgainst}</td>
            <td><div class="form-pills">${p.form.slice(-5).map(f => `<span class="pill ${f.result}" title="Rd${f.round} ${f.type} vs ${f.opponents.join(' & ')} (${f.opponentTeam}) — ${f.score}">${f.result}</span>`).join("")}</div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    </div>
    <p class="muted" style="margin-top:0.5rem;">Stats compiled from rubber-by-rubber results (singles + doubles) across all ${(DATA.teams || []).length || "the"} teams in ${escapeHtml(sectionShort())}${DATA.results.length ? `, rounds 1–${DATA.results.length}` : " (no rounds played yet)"}. Hover the form pills for set scores. "Order" is each player's roster/singles position (lower = more senior); rostered players may only play at their own position or higher (more senior). <span class="badge-e" title="Emergency player">E</span> = emergency player.</p>
  `;

  makeSortable(el.querySelector("table"), "players");

  el.querySelectorAll(".player-link").forEach(btn => {
    btn.addEventListener("click", () => {
      const team = btn.dataset.team;
      const name = btn.dataset.name;
      if (select.value !== team) {
        select.value = team;
        renderPlayers();
      }
      setTimeout(() => {
        const target = document.getElementById(`note-${slug(team)}-${slug(name)}`);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    });
  });

  renderPlayerNotes(filterTeam, stats);
}

/* ---------------- Player notes section (below Players table) ---------------- */

function renderPlayerNotes(filterTeam, stats) {
  const el = document.getElementById("player-notes-section");
  if (filterTeam === "all") {
    el.innerHTML = `<p class="muted">Select a specific team above to view and edit player scouting notes (plays, serving, general play, strengths, weaknesses).</p>`;
    return;
  }
  const players = stats.filter(p => p.team === filterTeam);
  if (!players.length) {
    el.innerHTML = `<p class="muted">No players recorded for ${escapeHtml(filterTeam)} yet.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;margin-bottom:0.6rem;">
        <h2 style="margin:0">${escapeHtml(filterTeam)} — Player Notes</h2>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <span id="save-to-site-status" class="save-status"></span>
          <button id="save-to-site-btn" class="btn" onclick="saveNotesToGitHub()">☁️ Save to site</button>
        </div>
      </div>
      <p class="muted" style="margin:0 0 0.75rem">Notes are saved on this device as you type. Click <strong>Save to site</strong> to sync them across all devices.</p>
      ${players.map(p => {
        const note = getPlayerNote(p.team, p.name);
        return `
        <div class="player-notes-card" id="note-${slug(p.team)}-${slug(p.name)}">
          <h4>${escapeHtml(p.name)}</h4>
          <div class="player-notes-grid">
            <div>
              <label>Plays</label>
              <select class="editable note-field" data-team="${escapeAttr(p.team)}" data-name="${escapeAttr(p.name)}" data-field="plays">
                <option value="">-</option>
                <option value="Right" ${note.plays === "Right" ? "selected" : ""}>Right</option>
                <option value="Left" ${note.plays === "Left" ? "selected" : ""}>Left</option>
                <option value="Both" ${note.plays === "Both" ? "selected" : ""}>Both</option>
              </select>
            </div>
            <div>
              <label>Serving</label>
              <input type="text" class="editable note-field" data-team="${escapeAttr(p.team)}" data-name="${escapeAttr(p.name)}" data-field="serving" placeholder="e.g. Big flat serve, kicks high" value="${escapeAttr(note.serving)}">
            </div>
            <div style="grid-column: 1 / -1;">
              <label>General play</label>
              <textarea class="editable note-field" data-team="${escapeAttr(p.team)}" data-name="${escapeAttr(p.name)}" data-field="generalPlay" placeholder="Style of play, tactics, fitness...">${escapeHtml(note.generalPlay)}</textarea>
            </div>
            <div>
              <label>Strengths</label>
              <textarea class="editable note-field" data-team="${escapeAttr(p.team)}" data-name="${escapeAttr(p.name)}" data-field="strengths">${escapeHtml(note.strengths)}</textarea>
            </div>
            <div>
              <label>Weaknesses</label>
              <textarea class="editable note-field" data-team="${escapeAttr(p.team)}" data-name="${escapeAttr(p.name)}" data-field="weaknesses">${escapeHtml(note.weaknesses)}</textarea>
            </div>
          </div>
        </div>`;
      }).join("")}
    </div>
  `;

  el.querySelectorAll(".note-field").forEach(field => {
    field.addEventListener("change", () => {
      savePlayerNote(field.dataset.team, field.dataset.name, field.dataset.field, field.value);
      flashSaved(field.closest(".player-notes-card").querySelector("h4"));
    });
  });
}

/* ---------------- Stats tab ---------------- */

let statsMode = "singles";

function initStatsToggle() {
  document.querySelectorAll("#stats-toggle button").forEach(btn => {
    btn.addEventListener("click", () => {
      statsMode = btn.dataset.mode;
      document.querySelectorAll("#stats-toggle button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderStatsRanking(computePlayerStats());
    });
  });
}

function renderStatsRanking(stats) {
  const el = document.getElementById("stats-ranking");
  const key = statsMode;
  const rows = stats.filter(p => p[key].played > 0)
    .sort((a, b) => {
      const aPct = a[key].wins / a[key].played, bPct = b[key].wins / b[key].played;
      if (bPct !== aPct) return bPct - aPct;
      return b[key].played - a[key].played;
    });

  if (!rows.length) {
    el.innerHTML = `<p class="muted">No data yet.</p>`;
    return;
  }

  el.innerHTML = `
    <div class="table-wrap">
    <table>
      <thead><tr><th>#</th><th>Player</th><th>Team</th><th>${statsMode === "singles" ? "Singles" : "Doubles"}</th><th>Win %</th><th>Games %</th></tr></thead>
      <tbody>
        ${rows.map((p, i) => {
          const gamesPct = (p.gamesFor + p.gamesAgainst) > 0 ? (p.gamesFor / (p.gamesFor + p.gamesAgainst)) * 100 : 0;
          return `
          <tr class="${p.team === OUR_TEAM ? "us-row" : ""}">
            <td>${i + 1}</td>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.team)}</td>
            <td>${p[key].wins}-${p[key].losses}</td>
            <td>${((p[key].wins / p[key].played) * 100).toFixed(0)}%</td>
            <td>${gamesPct.toFixed(1)}%</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    </div>
  `;
  makeSortable(el.querySelector("table"), "stats-ranking-" + statsMode);
}

function renderStats() {
  const stats = computePlayerStats();
  renderStatsRanking(stats);

  // UTR ranking (Berwick roster only — UTR data isn't available for opponents)
  const utrEl = document.getElementById("stats-utr");
  const berwick = stats.filter(p => p.team === OUR_TEAM && p.played > 0);

  if (!berwick.length) {
    utrEl.innerHTML = `<p class="muted">No games played yet.</p>`;
  } else {
    utrEl.innerHTML = `
      <div class="table-wrap">
      <table>
        <thead><tr><th>Player</th><th>Games % Singles</th><th>Games % Doubles</th><th>Games % Overall</th></tr></thead>
        <tbody>
          ${berwick.map(p => `
            <tr class="us-row">
              <td>${escapeHtml(p.name)}</td>
              <td>${gamesPctCell(p.singles)}</td>
              <td>${gamesPctCell(p.doubles)}</td>
              <td>${gamesPctCell(p)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      </div>
      <p class="muted" style="margin-top:0.5rem;">Share of games won (games for ÷ games for + against) for Berwick players who have played this season.</p>
    `;
  }
  if (utrEl.querySelector("table")) makeSortable(utrEl.querySelector("table"), "stats-utr");
}

function avgUtr(p) {
  const s = parseUtr(p.utrSingles), d = parseUtr(p.utrDoubles);
  if (s === null && d === null) return null;
  if (s === null) return d;
  if (d === null) return s;
  return (s + d) / 2;
}

/* ---------------- Helpers ---------------- */

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/* ---------------- Club context (club.js) ---------------- */

function clubData() { return window.CLUB_DATA || null; }

function clubEmergencyCell(name) {
  const c = clubData();
  const p = c && c.players && c.players[canonName(name)];
  const limit = (c && c.emergencyLimit) || 3;
  if (!p) return `<span class="muted">-</span>`;
  const n = p.emergencyCount || 0;
  const cls = n > limit ? "over" : n === limit ? "limit" : n === limit - 1 ? "warn" : n ? "ok" : "none";
  const tip = (p.emergencies || []).map(e => `${e.date} ${teamLabel(e.team)} v ${e.opponent || ""}`).join("\n");
  return `<span class="em-count ${cls}" title="${escapeAttr(tip || "No emergency appearances")}">${n}/${limit}</span>`;
}

function teamLabel(slug) {
  const c = clubData();
  const t = c && (c.teams || []).find(x => x.slug === slug);
  return t ? t.label : slug;
}

function fillPageChrome() {
  const m = DATA.meta || {};
  const label = m.label || sectionShort();
  document.title = `Berwick ${label} — ${m.competition || ""}`;
  const sub = document.getElementById("page-sub");
  if (sub) sub.innerHTML = `${escapeHtml(m.competition || "")} &middot; ${escapeHtml(m.section || "")}`;
  document.querySelectorAll(".sec-short").forEach(el => el.textContent = sectionShort());
  const sw = document.getElementById("team-switch");
  const c = clubData();
  if (sw && c) {
    sw.innerHTML = `<option value="../../">Club home</option>` + c.teams.map(t =>
      `<option value="../${t.slug}/"${t.slug === m.slug ? " selected" : ""}>${escapeHtml(t.label)} — ${escapeHtml(t.sectionName.replace("Open Singles/Doubles ", ""))}</option>`).join("");
    sw.addEventListener("change", () => { location.href = sw.value === "../../" ? "../../" : sw.value + location.hash; });
  } else if (sw) sw.parentElement.style.display = "none";
  const f = document.getElementById("page-footer");
  if (f) {
    const arch = (m.archives || []).map(a => `<a href="${a.path}">${escapeHtml(a.label)}</a>`).join(" &middot; ");
    f.innerHTML = `Berwick ${escapeHtml(label)} &middot; ${escapeHtml(m.competition || "")} &middot; Data from <a href="${m.sourceUrl}" target="_blank" rel="noopener">trols.org.au</a> &middot; Updated weekly (Wednesdays)<br><a href="../../">← All Berwick teams</a>${arch ? ` &middot; Past seasons: ${arch}` : ""}`;
  }
}

function sectionShort() {
  return ((DATA.meta && DATA.meta.section) || "").replace("Open Singles/Doubles ", "");
}

function clubByName(name) {
  return DATA.clubs.find(c => c.name === name || c.name.replace(" U/C", "") === name.replace(" U/C", ""));
}

function rosterByName(name) {
  return DATA.roster.find(p => p.name === name);
}

// Returns { order, emergency } for any player on any team in the section.
// Berwick uses DATA.roster (order/emergency already set there);
// other teams use DATA.teamRosters[team] (computed from rubber position data).
function getPlayerOrderInfo(team, name) {
  if (team === OUR_TEAM) {
    const r = rosterByName(name);
    return r ? { order: r.order, emergency: !!r.emergency } : { order: null, emergency: false };
  }
  const teamKey = team.replace(" U/C", "") === "Ashburton" ? "Ashburton U/C" : team;
  const list = (DATA.teamRosters && DATA.teamRosters[teamKey]) || [];
  const p = list.find(x => x.name === name);
  return p ? { order: p.order, emergency: !!p.emergency } : { order: null, emergency: false };
}

// Sort comparator: by order ascending (nulls last), then emergencies last, then name.
function byRosterOrder(team) {
  return (a, b) => {
    const ia = getPlayerOrderInfo(team, a.name);
    const ib = getPlayerOrderInfo(team, b.name);
    if (ia.emergency !== ib.emergency) return ia.emergency ? 1 : -1;
    const oa = ia.order ?? 999, ob = ib.order ?? 999;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name);
  };
}

// Turn a masked or precise UTR string ("5.xx", "5.23") into a sortable number.
function parseUtr(val) {
  if (!val) return null;
  const cleaned = String(val).replace(/x/gi, "0");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function formatUtr(p, type) {
  const val = type === "singles" ? p.utrSingles : p.utrDoubles;
  if (!val) return `<span class="muted">-</span>`;
  return escapeHtml(val);
}

function mapsLink(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// Find a previously-played result this season between OUR_TEAM and opponent (before given date).
function findPreviousResult(opponent, beforeDate) {
  for (const round of DATA.results) {
    for (const m of round.matches) {
      const involvesUs = m.home === OUR_TEAM || m.away === OUR_TEAM;
      const involvesOpp = m.home === opponent || m.away === opponent;
      if (involvesUs && involvesOpp && round.date < beforeDate) {
        const usHome = m.home === OUR_TEAM;
        return {
          round: round.round,
          date: round.date,
          usPts: usHome ? m.homePts : m.awayPts,
          oppPts: usHome ? m.awayPts : m.homePts,
          usRubbers: usHome ? m.homeR : m.awayR,
          oppRubbers: usHome ? m.awayR : m.homeR,
          venue: usHome ? "home" : "away"
        };
      }
    }
  }
  return null;
}

/* ---------------- Tabs ---------------- */

function initTabs() {
  function activateTab(tabId) {
    const valid = document.getElementById(tabId) ? tabId : "dashboard";
    document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    const btn = document.querySelector(`nav button[data-tab="${valid}"]`);
    const section = document.getElementById(valid);
    if (btn) btn.classList.add("active");
    if (section) section.classList.add("active");
  }

  document.querySelectorAll("nav button").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      history.pushState(null, "", `#${tabId}`);
      activateTab(tabId);
    });
  });

  // Back / forward button support
  window.addEventListener("popstate", () => {
    activateTab(location.hash.slice(1) || "dashboard");
  });

  // Honour hash on initial load (e.g. shared link or page refresh)
  activateTab(location.hash.slice(1) || "dashboard");
}

/* ---------------- Dashboard ---------------- */

function renderDashboard() {
  const ladder = computeLadder();
  const today = todayISO();

  // Next match: first scheduled, non-bye row with date >= today
  const next = DATA.schedule.find(s => !s.byeDate && s.home && s.away && s.date >= today);
  const el = document.getElementById("next-match");

  if (next) {
    const isHome = next.home === OUR_TEAM;
    const opponent = isHome ? next.away : next.home;
    const venue = clubByName(next.home);
    const oppLadder = ladder.find(t => t.team === opponent || t.team.replace(" U/C", "") === opponent.replace(" U/C", ""));
    const usLadder = ladder.find(t => t.team === OUR_TEAM);

    const pillsFor = (ladderEntry) => (ladderEntry ? ladderEntry.form.slice(-5) : []).map(f =>
      `<span class="pill ${f.result}" title="Rd${f.round} vs ${f.opponent} (${f.pts}-${f.oppPts})">${f.result}</span>`
    ).join("");
    const usForm = pillsFor(usLadder);
    const oppForm = pillsFor(oppLadder);

    // Previous result this season vs this opponent (if any)
    const prev = findPreviousResult(opponent, next.date);
    const prevBlock = prev ? `
      <div class="muted" style="margin-top:0.5rem;">
        Previous result this season (Rd${prev.round}, ${prev.venue}):
        <span class="badge ${prev.usPts > prev.oppPts ? "win" : "loss"}">${prev.usPts > prev.oppPts ? "W" : "L"} ${prev.usPts.toFixed(0)}-${prev.oppPts.toFixed(0)} pts</span>
        <span class="muted">(rubbers ${prev.usRubbers}-${prev.oppRubbers})</span>
      </div>` : "";

    el.innerHTML = `
      <div class="next-match-head">
        <div class="muted">Round ${next.round} &middot; ${fmtDate(next.date)}</div>
        <div class="vs">${isHome ? `Berwick <span class="muted" style="font-size:1rem;">(home)</span> vs ${escapeHtml(opponent)}` : `${escapeHtml(opponent)} <span class="muted" style="font-size:1rem;">(away – we travel)</span> vs Berwick`}</div>
      </div>
      <div class="next-match-avail"><span class="muted">Available:</span> ${availabilityChips(next.date, { full: true })}</div>
      ${lineupBlock(next.date)}
      <div class="next-match-grid">
        <div class="match-venue-block">
          ${venue ? `
            <div><a href="${mapsLink(venue.address)}" target="_blank" rel="noopener">${escapeHtml(venue.address)}</a></div>
            <div class="court-type-banner">${venue.courtType ? `🎾 ${escapeHtml(venue.courtType)}` : `<span class="muted">Court surface not known yet</span>`}</div>
            <div class="map-embed">
              <iframe src="https://www.google.com/maps?q=${encodeURIComponent(venue.address)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
              <a class="map-open" href="${mapsLink(venue.address)}" target="_blank" rel="noopener">Directions ↗</a>
            </div>
            ${venue.notes ? `<div class="venue-notes-block"><div class="label">Venue notes</div>${escapeHtml(venue.notes).replace(/\n/g, "<br>")}</div>` : ""}
          ` : ""}
          ${prevBlock}
        </div>
        <div>
          <div class="muted" style="margin-bottom:0.35rem;">Ladder comparison</div>
          <div class="table-wrap">
          <table class="compare-table">
            <thead><tr><th></th><th>Berwick</th><th>${escapeHtml(opponent)}</th></tr></thead>
            <tbody>
              <tr><td>Ladder pos</td><td>${usLadder ? usLadder.position : "-"}</td><td>${oppLadder ? oppLadder.position : "-"}</td></tr>
              <tr><td>Points</td><td>${usLadder ? usLadder.pts.toFixed(1) : "0.0"}</td><td>${oppLadder ? oppLadder.pts.toFixed(1) : "0.0"}</td></tr>
              <tr>
                <td>Form (last 5)</td>
                <td><div class="form-pills" style="justify-content:center;">${usForm || "<span class='muted'>-</span>"}</div></td>
                <td><div class="form-pills" style="justify-content:center;">${oppForm || "<span class='muted'>-</span>"}</div></td>
              </tr>
            </tbody>
          </table>
          </div>
          <div class="muted" style="margin-top:0.5rem;"><a href="#" data-goto-players="${escapeAttr(opponent)}">View/edit ${escapeHtml(opponent)} player notes &rarr;</a></div>
        </div>
      </div>
      <div class="grid-2" style="margin-top:1rem;">
        <div>
          <h3>Berwick</h3>
          ${teamRosterTable(OUR_TEAM)}
        </div>
        <div>
          <h3>${escapeHtml(opponent)}</h3>
          ${teamRosterTable(opponent)}
        </div>
      </div>
    `;

    el.querySelector('[data-goto-players]').addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelector('nav button[data-tab="players"]').click();
      const sel = document.getElementById("players-team");
      sel.value = opponent;
      sel.dispatchEvent(new Event("change"));
    });
  } else {
    el.innerHTML = `<p class="muted">No upcoming matches found in the schedule.</p>`;
  }

  // Ladder snapshot — full ladder with finals (top 4) cutoff line
  const snap = document.getElementById("ladder-snapshot");
  snap.innerHTML = `
    <div class="table-wrap">
    <table>
      <thead><tr><th>#</th><th>Team</th><th>Pld</th><th>Pts</th><th>Form</th></tr></thead>
      <tbody>
        ${ladder.map(t => `
          <tr class="${t.team === OUR_TEAM ? "us-row" : ""}${t.position === 4 ? " finals-cutoff" : ""}">
            <td>${t.position}</td>
            <td>${escapeHtml(t.team)}</td>
            <td>${t.played}</td>
            <td>${t.pts.toFixed(1)}</td>
            <td><div class="form-pills">${t.form.slice(-5).map(f => `<span class="pill ${f.result}" title="Rd${f.round} vs ${f.opponent} (${f.pts}-${f.oppPts})">${f.result}</span>`).join("")}</div></td>
          </tr>`).join("")}
      </tbody>
    </table>
    </div>
  `;
}

// Mini player-stats table for a team, used on the dashboard for the upcoming match.
function teamRosterTable(team) {
  const stats = computePlayerStats().filter(p => p.team === team || p.team.replace(" U/C", "") === team.replace(" U/C", ""));
  if (!stats.length) return `<p class="muted">No player stats yet this season.</p>`;
  const sorted = [...stats].sort(byRosterOrder(team));
  return `
    <div class="table-wrap" style="margin-top:0.5rem;">
    <table>
      <thead><tr><th></th><th>Order</th><th>Player</th><th>Singles W-L</th><th>Doubles W-L</th></tr></thead>
      <tbody>
        ${sorted.map(p => {
          const info = getPlayerOrderInfo(team, p.name);
          return `
          <tr>
            <td>${info.emergency ? `<span class="badge-e" title="Emergency player">E</span>` : ""}</td>
            <td>${info.order ?? "-"}</td>
            <td>${escapeHtml(p.name)}</td>
            <td>${p.singles.played ? `${p.singles.wins}-${p.singles.losses}` : `<span class="muted">-</span>`}</td>
            <td>${p.doubles.played ? `${p.doubles.wins}-${p.doubles.losses}` : `<span class="muted">-</span>`}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    </div>
  `;
}

/* ---------------- Ladder tab ---------------- */

function renderLadder() {
  const ladder = computeLadder();
  const el = document.getElementById("ladder-table");
  el.innerHTML = `
    <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th><th>Team</th><th>Pld</th><th>Pts</th>
          <th>Rubbers</th><th>Sets</th><th>Games</th><th>Game %</th><th>Form</th>
        </tr>
      </thead>
      <tbody>
        ${ladder.map(t => `
          <tr class="${t.team === OUR_TEAM ? "us-row" : ""}${t.position === 4 ? " finals-cutoff" : ""}">
            <td>${t.position}</td>
            <td>${escapeHtml(t.team)}</td>
            <td>${t.played}</td>
            <td>${t.pts.toFixed(1)}</td>
            <td>${t.rFor}-${t.rAgainst}</td>
            <td>${t.sFor}-${t.sAgainst}</td>
            <td>${t.gFor}-${t.gAgainst}</td>
            <td>${(t.gamePct * 100).toFixed(1)}%</td>
            <td><div class="form-pills">${t.form.slice(-5).map(f => `<span class="pill ${f.result}" title="Rd${f.round} vs ${f.opponent} (${f.pts}-${f.oppPts})">${f.result}</span>`).join("")}</div></td>
          </tr>`).join("")}
      </tbody>
    </table>
    </div>
    <p class="muted" style="margin-top:0.5rem;">Ladder is calculated live from match results below. Tiebreak order: Points &rarr; Set % &rarr; Game %.</p>
  `;
}

/* ---------------- Finals tab ---------------- */

function renderFinals() {
  const el = document.getElementById("finals-content");
  if (!el) return;
  const ladder = computeLadder();
  const strength = computeRemainingStrength();

  const ladderRows = ladder.map(t => `
    <tr class="${t.team === OUR_TEAM ? "us-row" : ""}${t.position === 4 ? " finals-cutoff" : ""}">
      <td>${t.position}</td>
      <td>${escapeHtml(t.team)}</td>
      <td>${t.played}</td>
      <td>${t.pts.toFixed(1)}</td>
      <td><div class="form-pills">${t.form.slice(-5).map(f => `<span class="pill ${f.result}" title="Rd${f.round} vs ${f.opponent} (${f.pts}-${f.oppPts})">${f.result}</span>`).join("")}</div></td>
    </tr>`).join("");

  const withGames = strength.filter(t => t.games.length);

  const strengthRows = withGames.map((t, i) => {
    const chips = t.games.map(g => {
      const rank = g.oppLadder ? g.oppLadder.position : "?";
      const finalsBound = g.oppLadder && g.oppLadder.position <= 4;
      const title = `Round ${g.round} (${fmtDate(g.date)}) — ${g.venue === "home" ? "home vs" : "away at"} ${g.opponent}${g.oppLadder ? `, currently #${g.oppLadder.position} on ${g.oppLadder.pts.toFixed(1)} pts` : ""}`;
      return `<span class="opp-chip${finalsBound ? " opp-finals" : ""}" title="${escapeAttr(title)}">${g.venue === "home" ? "v" : "@"} ${escapeHtml(g.opponent)} <span class="rank">#${rank}</span></span>`;
    }).join("");
    return `
      <tr class="${t.team === OUR_TEAM ? "us-row" : ""}">
        <td>${i + 1}</td>
        <td>${escapeHtml(t.team)}</td>
        <td>${t.ladder ? t.ladder.position : "-"}</td>
        <td>${t.ladder ? t.ladder.pts.toFixed(1) : "-"}</td>
        <td>${t.avgOppPts !== null ? t.avgOppPts.toFixed(1) : "-"}</td>
        <td><div class="opp-chips">${chips}</div></td>
      </tr>`;
  }).join("");

  el.innerHTML = `
    <div class="card">
      <h3>Ladder right now</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Team</th><th>Pld</th><th>Pts</th><th>Form</th></tr></thead>
          <tbody>${ladderRows}</tbody>
        </table>
      </div>
      <p class="finals-note muted"><span class="swatch"></span>Line marks the top 4 — finals qualification cutoff.</p>
    </div>
    <div class="card">
      <h3>Strength of run home (remaining rounds)</h3>
      ${withGames.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Team</th><th>Ladder pos</th><th>Pts</th><th>Avg opp pts</th><th>Remaining opponents</th></tr></thead>
          <tbody>${strengthRows}</tbody>
        </table>
      </div>
      <p class="muted" style="margin-top:0.5rem;">Sorted easiest to hardest by the average current ladder points of each team's remaining opponents (lower = easier). Chips outlined in green are against a current top-4 (finals-bound) side. Recalculates automatically each week as results and the ladder update.</p>
      ` : `<p class="muted">Season complete — no remaining rounds.</p>`}
    </div>
  `;
}

/* ---------------- Results tab ---------------- */

function renderResultsChart() {
  const el = document.getElementById("results-chart");
  const { rounds, teams } = computeLadderProgression();
  if (!rounds.length) {
    el.innerHTML = `<p class="muted">No results yet.</p>`;
    return;
  }

  const teamNames = Object.keys(teams);
  const maxPts = Math.max(1, ...teamNames.map(t => Math.max(...teams[t])));
  const W = 640, H = 260, padL = 38, padR = 16, padT = 16, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xStep = rounds.length > 1 ? plotW / (rounds.length - 1) : 0;
  const palette = ["#42a5f5", "#ef5350", "#ffb74d", "#ba68c8", "#4dd0e1", "#f06292", "#a1887f", "#90a4ae"];
  let colorIdx = 0;

  const lines = teamNames.map(team => {
    const isUs = team === OUR_TEAM;
    const color = isUs ? "#d4e600" : palette[colorIdx++ % palette.length];
    const points = teams[team].map((pts, idx) => {
      const x = padL + idx * xStep;
      const y = padT + plotH - (pts / maxPts) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return { team, color, points, isUs };
  });

  const xLabels = rounds.map((r, idx) => {
    const x = padL + idx * xStep;
    return `<text x="${x}" y="${H - 8}" font-size="10" fill="var(--muted)" text-anchor="middle">R${r}</text>`;
  }).join("");

  const yTicks = 4;
  const yLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = (maxPts / yTicks) * i;
    const y = padT + plotH - (val / maxPts) * plotH;
    return `<text x="${padL - 6}" y="${y + 3}" font-size="10" fill="var(--muted)" text-anchor="end">${val.toFixed(0)}</text>
            <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-width="1"/>`;
  }).join("");

  el.innerHTML = `
    <div class="results-chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%; max-width:700px; height:auto;">
        ${yLines}
        ${lines.map(l => `<polyline points="${l.points}" fill="none" stroke="${l.color}" stroke-width="${l.isUs ? 3 : 2}" opacity="${l.isUs ? 1 : 0.85}"/>`).join("")}
        ${xLabels}
      </svg>
    </div>
    <div class="results-chart-legend">
      ${lines.map(l => `<div class="legend-item"><span class="swatch" style="background:${l.color};"></span>${escapeHtml(l.team)}</div>`).join("")}
    </div>
    <p class="muted" style="margin-top:0.5rem;">Cumulative ladder points after each round.</p>
  `;
}

function renderRubberDetail(m) {
  if (!m.rubbers || !m.rubbers.length) return `<span class="muted">No rubber detail available.</span>`;
  return `
    <div class="table-wrap">
    <table>
      <thead><tr><th>Type</th><th>Home players</th><th>Sets</th><th>Away players</th><th>Result</th></tr></thead>
      <tbody>
        ${m.rubbers.map(r => {
          const homeWon = r.winner === "home";
          const setScores = (r.sets || []).map(s => `${s[0]}-${s[1]}`).join(", ");
          return `
          <tr>
            <td>${r.type === "singles" ? "Singles" : "Doubles"}</td>
            <td>${(r.homePlayers || []).map(n => escapeHtml(n)).join(" & ")}</td>
            <td>${setScores}</td>
            <td>${(r.awayPlayers || []).map(n => escapeHtml(n)).join(" & ")}</td>
            <td><span class="badge ${homeWon ? "win" : "loss"}">${escapeHtml(homeWon ? m.home : m.away)} won</span></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    </div>
  `;
}

function renderResults() {
  renderResultsChart();
  const el = document.getElementById("results-list");
  const rounds = [...DATA.results].sort((a, b) => b.round - a.round);
  el.innerHTML = rounds.map(r => `
    <div class="card">
      <h3>Round ${r.round} &middot; ${fmtDate(r.date)}</h3>
      <div class="table-wrap">
      <table>
        <thead><tr><th>Home</th><th>Pts</th><th>R</th><th>S</th><th>G</th><th>Pts</th><th>R</th><th>S</th><th>G</th><th>Away</th></tr></thead>
        <tbody>
          ${r.matches.map((m, idx) => `
            <tr class="${m.home === OUR_TEAM || m.away === OUR_TEAM ? "us-row" : ""}">
              <td>${m.rubbers && m.rubbers.length ? `<button class="match-home-link" data-round="${r.round}" data-idx="${idx}">${escapeHtml(m.home)}</button>` : escapeHtml(m.home)}</td>
              <td>${m.homePts.toFixed(1)}</td><td>${m.homeR}</td><td>${m.homeS}</td><td>${m.homeG}</td>
              <td>${m.awayPts.toFixed(1)}</td><td>${m.awayR}</td><td>${m.awayS}</td><td>${m.awayG}</td>
              <td>${escapeHtml(m.away)}</td>
            </tr>
            <tr class="rubber-detail" id="detail-${r.round}-${idx}" style="display:none;">
              <td colspan="10">${renderRubberDetail(m)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      </div>
    </div>
  `).join("");

  el.querySelectorAll(".match-home-link").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = document.getElementById(`detail-${btn.dataset.round}-${btn.dataset.idx}`);
      if (row) row.style.display = row.style.display === "none" ? "" : "none";
    });
  });
}

/* ---------------- Roster tab ---------------- */

function renderRoster() {
  const el = document.getElementById("roster-table");
  const sortedRoster = [...DATA.roster].sort((a, b) => {
    if (a.emergency !== b.emergency) return a.emergency ? 1 : -1;
    const oa = a.order ?? 999, ob = b.order ?? 999;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name);
  });
  el.innerHTML = `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th></th><th>Player</th><th>Order</th><th>Played</th><th title="Times played as an emergency for another Berwick team this season (club-wide)">Emerg. elsewhere</th><th>Mobile</th><th>Email</th><th>UTR Singles</th><th>UTR Doubles</th></tr>
      </thead>
      <tbody>
        ${sortedRoster.map(p => `
          <tr>
            <td>${p.emergency ? `<span class="badge-e" title="Emergency player">E</span>` : ""}</td>
            <td>${escapeHtml(p.name)}</td>
            <td>${p.order ?? "-"}</td>
            <td>${p.played}</td>
            <td>${clubEmergencyCell(p.name)}</td>
            <td><input type="text" class="editable roster-contact" data-name="${escapeAttr(p.name)}" data-field="mobile" placeholder="Mobile" value="${escapeAttr(p.mobile || "")}"></td>
            <td><input type="text" class="editable roster-contact" data-name="${escapeAttr(p.name)}" data-field="email" placeholder="Email" value="${escapeAttr(p.email || "")}"></td>
            <td><input type="text" class="editable roster-utr utr-input" data-name="${escapeAttr(p.name)}" data-field="utrSingles" placeholder="e.g. 7.50 or 5.xx" value="${escapeAttr(p.utrSingles ?? "")}"></td>
            <td><input type="text" class="editable roster-utr utr-input" data-name="${escapeAttr(p.name)}" data-field="utrDoubles" placeholder="e.g. 7.50 or 6.xx" value="${escapeAttr(p.utrDoubles ?? "")}"></td>
          </tr>`).join("")}
      </tbody>
    </table>
    </div>
    <p class="muted" style="margin-top:0.5rem;">Exact UTR ratings are hidden behind UTR Sports' sign-in wall, so values are shown masked (e.g. "5.xx") — replace with exact ratings here once known; changes are saved in this browser. <span class="badge-e" title="Emergency player">E</span> = emergency player.</p>
  `;
  el.querySelectorAll(".roster-utr, .roster-contact").forEach(input => {
    input.addEventListener("change", () => {
      const name = input.dataset.name;
      const field = input.dataset.field;
      OVERRIDES.roster[name] = OVERRIDES.roster[name] || {};
      OVERRIDES.roster[name][field] = input.value;
      saveOverrides();
      flashSaved(input);
    });
  });
}

/* ---------------- Schedule tab ---------------- */

function renderSchedule() {
  const el = document.getElementById("schedule-table");
  const today = todayISO();
  el.innerHTML = `
    <div class="table-wrap">
    <table>
      <thead><tr><th>Rd</th><th>Date</th><th>Home</th><th>Away</th><th>Venue</th><th>Available</th><th></th></tr></thead>
      <tbody>
        ${DATA.schedule.map(s => {
          if (s.byeDate || (!s.home && !s.away)) {
            const finals = !s.byeDate && s.note;
            return `<tr><td>${s.round ?? ""}</td><td>${fmtDate(s.date)}</td><td colspan="3" class="muted">${s.note || "No Play"}</td><td>${finals ? availabilityChips(s.date, { compact: true }) : ""}</td><td></td></tr>`;
          }
          const isHome = s.home === OUR_TEAM;
          const venue = clubByName(s.home);
          const isPast = s.date < today;
          const result = isPast ? DATA.results.find(r => r.round === s.round) : null;
          let resultBadge = "";
          if (result) {
            const m = result.matches.find(mm => mm.home === s.home && mm.away === s.away);
            if (m) {
              const usWon = (isHome && m.homePts > m.awayPts) || (!isHome && m.awayPts > m.homePts);
              resultBadge = `<span class="badge ${usWon ? "win" : "loss"}">${usWon ? "W" : "L"} ${m.homePts.toFixed(0)}-${m.awayPts.toFixed(0)}</span>`;
            }
          }
          return `<tr class="${s.date === nextMatchDate() ? "us-row" : ""}">
            <td>${s.round}</td>
            <td>${fmtDate(s.date)}</td>
            <td>${s.home === OUR_TEAM ? `<strong>${escapeHtml(s.home)}</strong>` : escapeHtml(s.home)}</td>
            <td>${s.away === OUR_TEAM ? `<strong>${escapeHtml(s.away)}</strong>` : escapeHtml(s.away)}</td>
            <td>${venue ? `${escapeHtml(venue.address)} &middot; <a href="${mapsLink(venue.address)}" target="_blank" rel="noopener">Map</a>` : ""}</td>
            <td>${availabilityChips(s.date, { compact: true })}</td>
            <td>${resultBadge}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    </div>
  `;
}

function nextMatchDate() {
  const today = todayISO();
  const next = DATA.schedule.find(s => !s.byeDate && s.home && s.away && s.date >= today);
  return next ? next.date : null;
}

/* ---------------- Venues tab ---------------- */

function renderVenues() {
  // Read-only: venue details come from trols + club research (club.json manual.courtTypes). Ask Claude to change them.
  const el = document.getElementById("venues-list");
  el.innerHTML = DATA.clubs.map(c => `
    <div class="card">
      <h3>${escapeHtml(c.name)}${c.name === OUR_TEAM ? ' <span class="tag">us</span>' : ""}</h3>
      <p class="muted">${escapeHtml(c.address)} &middot; <a href="${mapsLink(c.address)}" target="_blank" rel="noopener">Map &rarr;</a></p>
      <div class="court-type-banner">${c.courtType ? `🎾 ${escapeHtml(c.courtType)}` : `<span class="muted">Court surface not known yet</span>`}</div>
      <div class="grid-2">
        <div>
          <label class="muted">Contact</label>
          <div>${escapeHtml(c.contactName || "-")} ${c.contactPhone ? "&middot; " + escapeHtml(c.contactPhone) : ""}</div>
          ${c.clubhousePhone ? `<div class="muted">Clubhouse: ${escapeHtml(c.clubhousePhone)}</div>` : ""}
        </div>
        ${c.notes ? `<div><label class="muted">Notes</label><div>${escapeHtml(c.notes).replace(/\n/g, "<br>")}</div></div>` : ""}
      </div>
    </div>
  `).join("");
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function escapeAttr(s) {
  return (s || "").replace(/"/g, "&quot;");
}

/* ---------------- Save indicator ---------------- */

function flashSaved(el) {
  let indicator = el.parentElement.querySelector(".save-status");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "save-status";
    el.parentElement.appendChild(indicator);
  }
  indicator.textContent = "Saved ✓";
  setTimeout(() => { indicator.textContent = ""; }, 1500);
}

/* ---------------- Export / Import ---------------- */

function initDataTools() {
  document.getElementById("export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(OVERRIDES, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "berwick-comp-notes-backup.json";
    a.click();
  });

  document.getElementById("clear-pat-btn").addEventListener("click", () => {
    localStorage.removeItem(PAT_KEY);
    alert("GitHub token cleared. You'll be prompted for it next time you save to site.");
  });

  document.getElementById("import-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        OVERRIDES = { roster: {}, clubs: {}, playerNotes: {}, ...imported };
        saveOverrides();
        applyOverrides();
        renderAll();
        alert("Notes imported successfully.");
      } catch (err) {
        alert("Could not read that file: " + err.message);
      }
    };
    reader.readAsText(file);
  });
}

/* ---------------- Init ---------------- */

function updateVisibility() {
  const maxRound = Math.max(0, ...DATA.results.map(r => r.round || 0));
  // Finals tab: hidden until round 8 results are in
  const showFinals = maxRound >= 8;
  const fb = document.querySelector('nav button[data-tab="finals"]');
  const fs = document.getElementById("finals");
  if (fb) fb.style.display = showFinals ? "" : "none";
  if (!showFinals && fs && fs.classList.contains("active")) {
    fs.classList.remove("active");
    document.querySelector('nav button[data-tab="dashboard"]').classList.add("active");
    document.getElementById("dashboard").classList.add("active");
  }
  // Ladder progression: hidden until round 2 results
  const chart = document.getElementById("results-chart");
  if (chart && chart.closest(".card")) chart.closest(".card").style.display = DATA.results.length >= 2 ? "" : "none";
}

function renderAll() {
  updateVisibility();
  renderDashboard();
  renderLadder();
  renderFinals();
  renderResults();
  renderPlayers();
  renderStats();
  renderRoster();
  renderSchedule();
  renderAvailabilityGrid();
  renderVenues();
  if (typeof renderCharts === "function") renderCharts();
}

async function init() {
  // Always fetch the latest data.json with a cache-busting timestamp so
  // teammates never need to hard-refresh after a data update.
  try {
    const res = await fetch(`data.json?_=${Date.now()}`);
    if (res.ok) {
      const fresh = await res.json();
      window.SITE_DATA = fresh; // overwrite so loadOverrides() picks up fresh playerNotes
    }
  } catch (e) {
    // Offline or fetch failed — fall back to whatever data.js bundled
  }

  DATA = window.SITE_DATA;
  OVERRIDES = loadOverrides();
  applyOverrides();
  fillPageChrome();

  document.getElementById("last-updated").textContent =
    `Results loaded: ${DATA.meta.resultsLoadedFromSite || DATA.meta.lastUpdated}`;

  initTabs();
  initDataTools();
  initStatsToggle();
  renderAll();
}

init();
