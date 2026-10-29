/* Berwick Tennis Club — club hub (index.html). Reads club.json + every team's data.json. */

const TEAM_TABS = ["dashboard", "ladder", "finals", "results", "players", "stats", "schedule", "venues", "roster"];
// Old bookmarks (site root + #tab) were the A Res 2 page — send them there.
if (TEAM_TABS.includes(location.hash.slice(1))) location.replace(`teams/a-res-2/${location.hash}`);

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmtDate = iso => new Date(iso + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const mapsLink = a => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
const short = s => (s || "").replace("Open Singles/Doubles ", "");

async function loadJSON(path, fallback) {
  try {
    const r = await fetch(`${path}?_=${Date.now()}`);
    if (r.ok) return await r.json();
  } catch (e) { /* offline / file:// */ }
  return fallback;
}

function ladder(d) {
  const t = {};
  (d.teams || []).forEach(n => t[n] = { team: n, played: 0, pts: 0, w: 0, l: 0, sF: 0, sA: 0, gF: 0, gA: 0, form: [] });
  d.results.forEach(r => r.matches.forEach(m => {
    [["home", "away"], ["away", "home"]].forEach(([s, o]) => {
      const x = t[m[s]] || (t[m[s]] = { team: m[s], played: 0, pts: 0, w: 0, l: 0, sF: 0, sA: 0, gF: 0, gA: 0, form: [] });
      const won = m[`${s}Pts`] > m[`${o}Pts`];
      x.played++; x.pts += m[`${s}Pts`]; won ? x.w++ : x.l++;
      x.sF += m[`${s}S`]; x.sA += m[`${o}S`]; x.gF += m[`${s}G`]; x.gA += m[`${o}G`];
      x.form.push({ r: won ? "W" : "L", round: r.round, opp: m[o], score: `${m[`${s}Pts`]}-${m[`${o}Pts`]}` });
    });
  }));
  const pct = (a, b) => a + b ? a / (a + b) : 0;
  return Object.values(t).sort((a, b) => b.pts - a.pts || pct(b.sF, b.sA) - pct(a.sF, a.sA) || pct(b.gF, b.gA) - pct(a.gF, a.gA) || a.team.localeCompare(b.team))
    .map((x, i) => ({ ...x, pos: i + 1 }));
}

function nextMatch(d, from) {
  const day = from || todayISO();
  return d.schedule.find(s => s.date >= day && (s.home || s.away || s.note));
}

// The next Saturday on which at least one Berwick team actually plays (skips club-wide No Play weeks)
function nextPlayingDate(teams) {
  const dates = teams.flatMap(({ d }) => d.schedule.filter(s => s.date >= todayISO() && (s.home || s.away || (!s.byeDate && s.note))).map(s => s.date));
  return dates.sort()[0];
}

function lastResult(d) {
  for (let i = d.results.length - 1; i >= 0; i--) {
    const m = d.results[i].matches.find(x => x.home === "Berwick" || x.away === "Berwick");
    if (m) {
      const home = m.home === "Berwick";
      const us = home ? m.homePts : m.awayPts, them = home ? m.awayPts : m.homePts;
      return { round: d.results[i].round, opp: home ? m.away : m.home, us, them, won: us > them };
    }
  }
  return null;
}

function pill(f) { return `<span class="pill ${f.r}" title="Rd${f.round} v ${esc(f.opp)} (${f.score})">${f.r}</span>`; }

function renderWeek(club, teams) {
  const el = document.getElementById("this-week");
  const today = todayISO();
  const date = nextPlayingDate(teams);
  const skipped = [...new Set(teams.flatMap(({ d }) => d.schedule.filter(s => s.date >= today && date && s.date < date && s.byeDate && /no play/i.test(s.note || "")).map(s => s.date)))].sort();
  document.getElementById("week-title").textContent = date ? `Next round — ${fmtDate(date)}` : "This round";
  const banner = skipped.length ? `<p class="muted">No play ${skipped.map(fmtDate).join(", ")} — showing the next round.</p>` : "";
  el.innerHTML = banner + `<div class="hub-grid">${teams.map(({ t, d }) => {
    const n = nextMatch(d, date);
    const lad = ladder(d).find(x => x.team === "Berwick");
    const last = lastResult(d);
    const lineup = n && d.lineups && d.lineups[n.date];
    let body;
    if (!n) body = `<div class="muted">Season complete</div>`;
    else if (n.date !== date) body = `<div class="muted">${esc(n.note || "No match")} this week</div><div class="muted small">Next: ${fmtDate(n.date)}</div>`;
    else if (!n.home && !n.away) body = `<div class="hub-vs">${esc(n.note || "No play")}</div>`;
    else {
      const home = n.home === "Berwick", opp = home ? n.away : n.home;
      const venue = (d.clubs || []).find(c => c.name === n.home);
      const oppLad = ladder(d).find(x => x.team === opp);
      body = `
        <div class="hub-vs">${home ? "v" : "@"} ${esc(opp)} ${oppLad && d.results.length ? `<span class="muted small">(#${oppLad.pos})</span>` : ""}</div>
        <div class="small muted">Rd ${esc(n.round)} &middot; ${home ? "Home" : "Away"}${venue ? ` &middot; <a href="${mapsLink(venue.address)}" target="_blank" rel="noopener">${esc(venue.address.split(",").slice(-1)[0].trim())} map</a>` : ""}</div>
        ${lineup ? `<div class="small hub-lineup">${[lineup.singles1, lineup.singles2].filter(Boolean).map(esc).join(", ")}${lineup.doubles && lineup.doubles.length ? ` &middot; D: ${lineup.doubles.map(esc).join(" & ")}` : ""}</div>` : ""}`;
    }
    return `<div class="card hub-team" data-href="${t.path}">
      <div class="hub-team-head"><a class="hub-label" href="${t.path}">${esc(t.label)}</a><span class="muted small">${esc(short(t.sectionName))}</span></div>
      ${body}
      <div class="hub-foot small">
        ${lad && d.results.length ? `<span>Ladder <b>#${lad.pos}</b>/${(d.teams || []).length}</span>` : `<span class="muted">No results yet</span>`}
        ${last ? `<span class="badge ${last.won ? "win" : "loss"}">Last: ${last.won ? "W" : "L"} ${last.us}-${last.them}</span>` : ""}
      </div>
    </div>`;
  }).join("")}</div>`;
  el.querySelectorAll(".hub-team").forEach(c => c.addEventListener("click", e => {
    if (!e.target.closest("a")) location.href = c.dataset.href;
  }));
}

function renderLadders(teams) {
  document.getElementById("ladders-table").innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Team</th><th>Section</th><th>Pos</th><th>Pld</th><th>W-L</th><th>Pts</th><th>Form</th><th></th></tr></thead>
      <tbody>${teams.map(({ t, d }) => {
        const L = ladder(d), us = L.find(x => x.team === "Berwick") || {};
        const top4 = us.pos && us.pos <= 4 && d.results.length;
        return `<tr>
          <td><a href="${t.path}"><b>${esc(t.label)}</b></a></td>
          <td class="muted">${esc(short(t.sectionName))}</td>
          <td>${d.results.length ? `<b>${us.pos}</b>/${L.length}` : "-"}</td>
          <td>${us.played || 0}</td><td>${us.w || 0}-${us.l || 0}</td><td>${(us.pts || 0).toFixed(1)}</td>
          <td><div class="form-pills">${(us.form || []).slice(-5).map(pill).join("")}</div></td>
          <td>${top4 ? `<span class="tag">Top 4</span>` : ""}</td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>`;
}

function renderSnapshot(teams) {
  const rows = teams.map(({ t, d }) => {
    const L = ladder(d), us = L.find(x => x.team === "Berwick") || { pos: null, pts: 0 };
    return { label: t.label, path: t.path, pos: d.results.length ? us.pos : null, N: L.length, pts: us.pts };
  });
  const maxN = Math.max(...rows.map(r => r.N)), W = 680, padL = 110, padR = 30, rowH = 36, H = 34 + rowH * rows.length;
  const sx = p => padL + (p - 1) * (W - padL - padR) / (maxN - 1);
  const ord = p => p + (p === 1 ? "st" : p === 2 ? "nd" : p === 3 ? "rd" : "th");
  const s = [`<svg viewBox="0 0 ${W} ${H}" class="cx-chart" role="img" aria-label="Ladder position of every Berwick team">`];
  for (let p = 1; p <= maxN; p++) s.push(`<text x="${sx(p)}" y="16" class="cx-tick" text-anchor="middle">${ord(p)}</text>`);
  rows.forEach((r, i) => {
    const cy = 38 + i * rowH;
    s.push(`<a href="${r.path}"><text x="${padL - 14}" y="${cy + 4}" class="cx-lab" text-anchor="end">${esc(r.label)}</text></a>`);
    s.push(`<line x1="${sx(1)}" x2="${sx(r.N)}" y1="${cy}" y2="${cy}" class="cx-track"/>`);
    if (r.N > 4) s.push(`<line x1="${sx(1)}" x2="${sx(4)}" y1="${cy}" y2="${cy}" class="cx-track-top"/>`);
    for (let p = 1; p <= r.N; p++) s.push(`<circle cx="${sx(p)}" cy="${cy}" r="2.5" class="cx-tick-dot"/>`);
    if (r.pos) {
      s.push(`<circle cx="${sx(r.pos)}" cy="${cy}" r="10" class="cx-dot-us" data-tip="${esc(`${r.label}: ${ord(r.pos)} of ${r.N} (${r.pts} pts)`)}"/>`);
      s.push(`<text x="${sx(r.pos)}" y="${cy + 4}" class="cx-dot-num" text-anchor="middle">${r.pos}</text>`);
    }
  });
  s.push("</svg>");
  document.getElementById("club-snapshot").innerHTML =
    `<div class="cx-wrap">${s.join("")}</div><p class="muted small">Each Berwick team's current ladder position. The green part of each track is the top-4 finals zone (Rubbers A1 has only four teams).</p>`;
}

function renderEmergencies(club) {
  const limit = club.emergencyLimit || 3;
  const label = slug => (club.teams.find(t => t.slug === slug) || {}).label || slug || "?";
  const rows = Object.values(club.players).filter(p => p.emergencyCount > 0)
    .sort((a, b) => b.emergencyCount - a.emergencyCount || a.name.localeCompare(b.name));
  const cls = n => n > limit ? "over" : n === limit ? "limit" : n === limit - 1 ? "warn" : "ok";
  const meter = n => `<div class="em-meter">${Array.from({ length: limit }, (_, i) => `<span class="${i < n ? cls(n) : ""}"></span>`).join("")}</div>`;
  document.getElementById("emergencies").innerHTML = `
    <p class="muted">${esc(club.emergencyRule)} Counted from the <b>E</b> marks on trols scoresheets, plus any you've added by hand.</p>
    ${rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Player</th><th>Own team</th><th>Used</th><th class="em-wide"></th><th class="em-wide">Emergency appearances</th></tr></thead>
      <tbody>${rows.map(p => `<tr class="${p.emergencyCount >= limit ? "em-row-alert" : ""}">
        <td><b>${esc(p.name)}</b><div class="em-mobile">${p.emergencies.map(e => `<span class="em-chip">${fmtDate(e.date)} &middot; ${esc(label(e.team))}${e.source === "manual" ? " ✎" : ""}</span>`).join("")}</div></td>
        <td>${p.homeTeam ? esc(label(p.homeTeam)) : `<span class="muted">Unknown</span>`}${p.homeTeamSource === "manual" ? "" : p.homeTeam ? ` <span class="muted small" title="Worked out from scoresheets — tell Claude if wrong">(auto)</span>` : ""}</td>
        <td><span class="em-count ${cls(p.emergencyCount)}">${p.emergencyCount}/${limit}</span></td>
        <td class="em-wide">${meter(p.emergencyCount)}</td>
        <td class="em-list em-wide">${p.emergencies.map(e => `<span class="em-chip" title="${esc(e.source === "manual" ? "Added by hand" + (e.note ? " — " + e.note : "") : "From trols scoresheet")}">${fmtDate(e.date)} &middot; ${esc(label(e.team))}${e.opponent ? ` v ${esc(e.opponent)}` : ""}${e.source === "manual" ? " ✎" : ""}</span>`).join("")}</td>
      </tr>`).join("")}</tbody>
    </table></div>` : `<p>No emergency appearances yet this season.</p>`}
    <p class="muted small">Amber = one left before the limit; red = at the limit (any further emergency game rules them out of their own section). To record a fill-in that isn't on a scoresheet, or correct someone's own team, tell Claude.</p>`;
}

function renderPlayers(club, teams) {
  const label = slug => (club.teams.find(t => t.slug === slug) || {}).label || slug;
  const order = Object.fromEntries(club.teams.map((t, i) => [t.slug, i]));
  const players = Object.values(club.players).sort((a, b) =>
    (order[a.homeTeam] ?? 99) - (order[b.homeTeam] ?? 99) || a.name.localeCompare(b.name));
  document.getElementById("club-players").innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Player</th><th>Own team</th>${club.teams.map(t => `<th title="${esc(t.sectionName)}">${esc(t.label)}</th>`).join("")}<th>Emerg.</th></tr></thead>
      <tbody>${players.map(p => `<tr>
        <td>${esc(p.name)}</td><td>${p.homeTeam ? esc(label(p.homeTeam)) : `<span class="muted">?</span>`}</td>
        ${club.teams.map(t => { const n = p.apps[t.slug] || 0; const e = p.emergencies.filter(x => x.team === t.slug).length;
          return `<td class="${n ? "" : "muted"}">${n || "·"}${e ? ` <span class="badge-e" title="${e} as emergency">E</span>` : ""}</td>`; }).join("")}
        <td><span class="em-count ${p.emergencyCount ? (p.emergencyCount >= (club.emergencyLimit || 3) ? "limit" : p.emergencyCount === (club.emergencyLimit || 3) - 1 ? "warn" : "ok") : "none"}">${p.emergencyCount}</span></td>
      </tr>`).join("")}</tbody>
    </table></div>
    <p class="muted small">Matches played for each team this season, from trols scoresheets. "Own team" is where they play most as a regular (not as an E) — tell Claude if someone's is wrong.</p>`;
}

async function init() {
  const club = await loadJSON("club.json", window.CLUB_DATA);
  if (!club) { document.querySelector("main").innerHTML = "<p>Couldn't load club data.</p>"; return; }
  document.getElementById("hub-sub").innerHTML = `${esc(club.competition)} &middot; ${club.teams.length} teams`;
  document.getElementById("last-updated").textContent = `Results loaded: ${club.resultsLoadedFromSite || club.lastUpdated}`;
  const teams = (await Promise.all(club.teams.map(async t => ({ t, d: await loadJSON(`${t.path}data.json`, null) })))).filter(x => x.d);
  renderWeek(club, teams);
  renderSnapshot(teams);
  renderLadders(teams);
  renderEmergencies(club);
  renderPlayers(club, teams);
  document.getElementById("archives").innerHTML = (club.archives || []).map(a => `<a href="${a.path}">${esc(a.label)}</a>`).join(" &middot; ");

  document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach(x => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab").forEach(s => s.classList.toggle("active", s.id === b.dataset.tab));
    history.replaceState(null, "", b.dataset.tab === "week" ? location.pathname : `#${b.dataset.tab}`);
  }));
  const fromHash = () => {
    const btn = document.querySelector(`nav button[data-tab="${location.hash.slice(1)}"]`);
    if (btn) btn.click();
  };
  window.addEventListener("hashchange", fromHash);
  fromHash();
}

init();

(() => {
  const tip = document.createElement("div"); tip.id = "cx-tip"; tip.hidden = true; document.body.appendChild(tip);
  const show = (el, x, y) => { tip.textContent = el.getAttribute("data-tip"); tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(x + 14, innerWidth - r.width - 8)) + "px"; tip.style.top = Math.max(8, y - r.height - 12) + "px"; };
  ["pointermove", "pointerdown"].forEach(ev => document.addEventListener(ev, e => {
    const el = e.target.closest && e.target.closest("[data-tip]"); if (el) show(el, e.clientX, e.clientY); else tip.hidden = true; }));
})();
