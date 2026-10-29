/* Berwick Tennis Club — club Stats tab (hub). Berwick players only, across every Berwick team.
   Called from hub.js: renderClubStats(club, teams) where teams = [{ t, d }]. */

const HS = { blue: "#3987e5", orange: "#d95926", aqua: "#199e70" };

function hsEsc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function hsPct(a, b) { return a + b ? Math.round((100 * a) / (a + b)) : null; }
function hsShort(n) { return n.split(" ")[0]; }

function hsCollect(club, teams) {
  const clubAlias = (club.manual && club.manual.playerAliases) || {};
  const rubbers = [], matches = [];
  teams.forEach(({ t, d }) => {
    const alias = { ...clubAlias, ...(d.playerAliases || {}) };
    const canon = n => alias[n] || n;
    d.results.filter(r => typeof r.round === "number").forEach(r => r.matches.forEach(m => {
      if (m.home !== "Berwick" && m.away !== "Berwick") return;
      const s = m.home === "Berwick" ? "home" : "away", o = s === "home" ? "away" : "home";
      const match = { team: t.slug, label: t.label, round: r.round, date: r.date, opp: m[o], home: s === "home",
        us: m[`${s}Pts`], them: m[`${o}Pts`], won: m[`${s}Pts`] > m[`${o}Pts`], rW: m[`${s}R`], rL: m[`${o}R`], gF: m[`${s}G`], gA: m[`${o}G`] };
      matches.push(match);
      (m.rubbers || []).forEach(rb => {
        const sets = rb.sets.map(([a, b]) => (s === "home" ? [a, b] : [b, a]));
        rubbers.push({ ...match, type: rb.type, players: rb[`${s}Players`].map(canon), opps: rb[`${o}Players`],
          won: rb.winner === s, sets, gF: rb[`${s}Games`], gA: rb[`${o}Games`], incomplete: !!rb.incomplete });
      });
    }));
  });
  return { rubbers, matches };
}

function hsPlayers(club, rubbers) {
  const P = {};
  const get = n => P[n] || (P[n] = { name: n, home: (club.players[n] || {}).homeTeam, rub: 0, w: 0, gF: 0, gA: 0, sF: 0, sA: 0,
    sw: 0, sl: 0, dw: 0, dl: 0, bagels: 0, bread: 0, tbW: 0, tbL: 0, threeW: 0, threeL: 0, comebacks: 0, rounds: new Set(), teams: new Set() });
  rubbers.forEach(rb => rb.players.forEach(n => {
    const p = get(n);
    p.rub++; if (rb.won) p.w++;
    p.gF += rb.gF; p.gA += rb.gA;
    rb.sets.forEach(([a, b]) => {
      if (a > b) p.sF++; else if (b > a) p.sA++;
      if (a === 6 && b === 0) p.bagels++;
      if (a === 6 && b === 1) p.bread++;
      if (a === 7 && b === 6) p.tbW++;
      if (a === 6 && b === 7) p.tbL++;
    });
    if (rb.type === "singles") rb.won ? p.sw++ : p.sl++; else rb.won ? p.dw++ : p.dl++;
    if (rb.sets.length === 3) rb.won ? p.threeW++ : p.threeL++;
    if (rb.won && rb.sets.length >= 2 && rb.sets[0][0] < rb.sets[0][1]) p.comebacks++;
    p.rounds.add(`${rb.team}:${rb.round}`); p.teams.add(rb.label);
  }));
  Object.values(P).forEach(p => { p.matches = p.rounds.size; p.gp = hsPct(p.gF, p.gA); p.wp = hsPct(p.w, p.rub - p.w); });
  return P;
}

/* ---------- pieces ---------- */
function hsTile(big, label, sub) {
  return `<div class="hs-tile"><div class="hs-big">${big}</div><div class="hs-label">${label}</div>${sub ? `<div class="hs-sub">${sub}</div>` : ""}</div>`;
}

function hsLeader(title, unit, rows, fmt, note) {
  if (!rows.length) return `<div class="hs-board"><h3>${title}</h3><p class="muted small">Not enough games yet.</p></div>`;
  const max = Math.max(...rows.map(r => r.v)) || 1;
  return `<div class="hs-board"><h3>${title}</h3>${rows.map((r, i) => `
    <div class="hs-lrow ${i === 0 ? "first" : ""}">
      <span class="hs-rank">${i + 1}</span>
      <span class="hs-lname">${hsEsc(r.name)} <span class="muted small">${hsEsc(r.team || "")}</span></span>
      <span class="cx-bar"><span style="width:${Math.max(4, 100 * r.v / max)}%"></span></span>
      <span class="hs-lval">${fmt(r)}</span>
    </div>`).join("")}${note ? `<p class="muted small">${note}</p>` : ""}</div>`;
}

function hsTeamLabel(club, slug) { const t = club.teams.find(x => x.slug === slug); return t ? t.label : slug || ""; }

function hsFormGrid(club, matches) {
  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
  return `<div class="hs-grid-wrap"><table class="hs-form"><thead><tr><th></th>${rounds.map(r => `<th>Rd ${r}</th>`).join("")}<th>W-L</th></tr></thead><tbody>
    ${club.teams.map(t => {
      const ms = matches.filter(m => m.team === t.slug);
      const w = ms.filter(m => m.won).length;
      return `<tr><th><a href="${t.path}">${hsEsc(t.label)}</a></th>${rounds.map(r => {
        const m = ms.find(x => x.round === r);
        if (!m) return `<td><span class="hs-cell none" title="No match">–</span></td>`;
        return `<td><span class="hs-cell ${m.won ? "W" : "L"}" data-tip="${hsEsc(`${t.label} ${m.home ? "v" : "@"} ${m.opp}: ${m.won ? "won" : "lost"} ${m.us}–${m.them} pts (rubbers ${m.rW}-${m.rL})`)}">${m.us}–${m.them}</span></td>`;
      }).join("")}<td class="hs-wl">${w}-${ms.length - w}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}

function hsTeamBars(club, rubbers) {
  const rows = club.teams.map(t => {
    const rs = rubbers.filter(r => r.team === t.slug), w = rs.filter(r => r.won).length;
    const gF = rs.reduce((a, r) => a + r.gF, 0), gA = rs.reduce((a, r) => a + r.gA, 0);
    return { label: t.label, w, n: rs.length, p: hsPct(w, rs.length - w) ?? 0, g: hsPct(gF, gA) ?? 0 };
  }).sort((a, b) => b.p - a.p || b.g - a.g);
  const W = 680, padL = 110, padR = 170, padT = 28, rowH = 34, H = padT + rowH * rows.length + 8;
  const sx = v => padL + v / 100 * (W - padL - padR);
  const s = [`<svg viewBox="0 0 ${W} ${H}" class="cx-chart" role="img" aria-label="Rubbers won percentage by team">`];
  [0, 25, 50, 75, 100].forEach(v => {
    s.push(`<line x1="${sx(v)}" x2="${sx(v)}" y1="${padT - 6}" y2="${H - 8}" class="${v === 50 ? "cx-axis0" : "cx-grid"}"/>`);
    s.push(`<text x="${sx(v)}" y="${padT - 12}" class="cx-tick" text-anchor="middle">${v}%</text>`);
  });
  rows.forEach((r, i) => {
    const cy = padT + i * rowH + rowH / 2;
    s.push(`<text x="${padL - 12}" y="${cy + 4}" class="cx-lab" text-anchor="end">${hsEsc(r.label)}</text>`);
    s.push(`<rect x="${sx(0)}" y="${cy - 9}" width="${Math.max(2, sx(r.p) - sx(0)).toFixed(1)}" height="18" rx="4" fill="${HS.blue}" data-tip="${hsEsc(`${r.label}: ${r.w} of ${r.n} rubbers won, ${r.g}% of games`)}"/>`);
    s.push(`<text x="${(sx(100) + 14).toFixed(1)}" y="${cy + 4}" class="cx-val">${r.p}% <tspan class="cx-sub">${r.w}/${r.n} · games ${r.g}%</tspan></text>`);
  });
  s.push("</svg>");
  return `<div class="cx-wrap">${s.join("")}</div>`;
}

function hsScatter(players) {
  const ps = players.filter(p => p.rub > 0);
  const maxX = Math.max(4, ...ps.map(p => p.rub));
  const W = 680, H = 360, padL = 48, padR = 24, padT = 18, padB = 40;
  const sx = v => padL + v / (maxX + 0.5) * (W - padL - padR), sy = v => padT + (100 - v) / 100 * (H - padT - padB);
  const s = [`<svg viewBox="0 0 ${W} ${H}" class="cx-chart" role="img" aria-label="Rubbers played against share of games won for every Berwick player">`];
  [0, 25, 50, 75, 100].forEach(v => {
    s.push(`<line x1="${padL}" x2="${W - padR}" y1="${sy(v)}" y2="${sy(v)}" class="${v === 50 ? "cx-axis0" : "cx-grid"}"/>`);
    s.push(`<text x="${padL - 8}" y="${sy(v) + 4}" class="cx-tick" text-anchor="end">${v}%</text>`);
  });
  for (let x = 0; x <= maxX; x++) s.push(`<text x="${sx(x)}" y="${H - 18}" class="cx-tick" text-anchor="middle">${x}</text>`);
  s.push(`<text x="${(padL + W - padR) / 2}" y="${H - 2}" class="cx-sub" text-anchor="middle">Rubbers played</text>`);
  s.push(`<text x="${padL + 6}" y="${padT + 10}" class="cx-sub">Share of games won</text>`);
  // jitter identical points so every player stays visible
  const seen = {}, placed = [];
  const top = [...ps].sort((a, b) => b.gp * Math.min(b.rub, 4) - a.gp * Math.min(a.rub, 4)).slice(0, 6).map(p => p.name);
  ps.forEach(p => {
    const k = `${p.rub}:${p.gp}`; const j = seen[k] = (seen[k] || 0) + 1;
    const x = sx(p.rub) + (j - 1) * 9, y = sy(p.gp);
    s.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" class="hs-dot" data-tip="${hsEsc(`${p.name} (${p.homeLabel}) — ${p.rub} rubbers, ${p.w}-${p.rub - p.w}, games ${p.gF}-${p.gA} (${p.gp}%)`)}"/>`);
    if (top.includes(p.name) && !placed.some(([px, py]) => Math.abs(px - x) < 150 && Math.abs(py - y) < 16)) {
      placed.push([x, y]);
      const right = x < W - 170;
      s.push(`<text x="${(x + (right ? 11 : -11)).toFixed(1)}" y="${(y + 4).toFixed(1)}" class="cx-lab" text-anchor="${right ? "start" : "end"}">${hsEsc(p.name)}</text>`);
    }
  });
  s.push("</svg>");
  return `<div class="cx-wrap">${s.join("")}</div><p class="muted small">Every Berwick player this season. Higher is better; further right means more rubbers played. Hover or tap a dot for the player.</p>`;
}

function hsDonut(parts, centre, sub) {
  const total = parts.reduce((a, p) => a + p.v, 0) || 1, R = 42, C = 2 * Math.PI * R;
  let off = 0;
  const arcs = parts.map(p => {
    const len = C * p.v / total, gap = parts.length > 1 ? 2 : 0;
    const a = `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${p.c}" stroke-width="16" stroke-dasharray="${Math.max(0, len - gap).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 60 60)" data-tip="${hsEsc(p.tip)}"/>`;
    off += len; return a;
  }).join("");
  return `<svg viewBox="0 0 120 120" class="hs-donut" role="img" aria-label="${hsEsc(sub)}"><circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--border)" stroke-width="16"/>${arcs}
    <text x="60" y="62" text-anchor="middle" class="hs-donut-t">${centre}</text><text x="60" y="78" text-anchor="middle" class="cx-sub">${hsEsc(sub)}</text></svg>`;
}

function hsSplit(rubbers) {
  const grp = f => { const rs = rubbers.filter(f), w = rs.filter(r => r.won).length; return { w, l: rs.length - w, n: rs.length }; };
  const sg = grp(r => r.type === "singles"), db = grp(r => r.type === "doubles");
  const hm = grp(r => r.home), aw = grp(r => !r.home);
  const card = (title, a, b, la, lb) => {
    const pa = hsPct(a.w, a.l), pb = hsPct(b.w, b.l);
    return `<div class="hs-split"><h3>${title}</h3><div class="hs-split-row">
      ${hsDonut([{ v: a.w, c: HS.blue, tip: `${la}: ${a.w} won` }, { v: a.l, c: "#3a4452", tip: `${la}: ${a.l} lost` }], `${pa ?? "–"}${pa === null ? "" : "%"}`, la)}
      ${hsDonut([{ v: b.w, c: HS.blue, tip: `${lb}: ${b.w} won` }, { v: b.l, c: "#3a4452", tip: `${lb}: ${b.l} lost` }], `${pb ?? "–"}${pb === null ? "" : "%"}`, lb)}
    </div><p class="muted small">${la} ${a.w}-${a.l} · ${lb} ${b.w}-${b.l} rubbers</p></div>`;
  };
  return `<div class="hs-splits">${card("Singles v doubles", sg, db, "Singles", "Doubles")}${card("Home v away", hm, aw, "Home", "Away")}</div>`;
}

function hsHighlights(rubbers) {
  const fmtSets = r => r.sets.map(([a, b]) => `${a}-${b}`).join(", ");
  const who = r => r.players.join(" & ");
  const won = rubbers.filter(r => r.won && !r.incomplete);
  const biggest = [...won].sort((a, b) => (b.gF - b.gA) - (a.gF - a.gA))[0];
  const comebacks = rubbers.filter(r => r.won && r.sets.length >= 2 && r.sets[0][0] < r.sets[0][1]);
  const marathon = [...rubbers].sort((a, b) => (b.gF + b.gA) - (a.gF + a.gA))[0];
  const tight = rubbers.filter(r => r.sets.length === 3);
  const tW = tight.filter(r => r.won).length;
  const tbSets = rubbers.flatMap(r => r.sets.filter(([a, b]) => Math.max(a, b) === 7 && Math.min(a, b) === 6));
  const tbW = tbSets.filter(([a, b]) => a > b).length;
  const bagels = rubbers.reduce((n, r) => n + r.sets.filter(([a, b]) => a === 6 && b === 0).length, 0);
  const bread = rubbers.reduce((n, r) => n + r.sets.filter(([a, b]) => a === 6 && b === 1).length, 0);
  const card = (title, big, body) => `<div class="hs-fact"><div class="hs-fact-t">${title}</div><div class="hs-fact-big">${big}</div><div class="hs-fact-b">${body}</div></div>`;
  return `<div class="hs-facts">
    ${card("Bagels served", bagels, `Sets won 6-0. Plus <b>${bread}</b> breadsticks (6-1).`)}
    ${card("Tie-break record", `${tbW}-${tbSets.length - tbW}`, `Sets that went to 7-6.`)}
    ${card("Three-set thrillers", `${tW}-${tight.length - tW}`, `Rubbers that went the distance.`)}
    ${card("Comebacks", comebacks.length, comebacks.length ? `Rubbers won after losing the first set. Latest: ${hsEsc(who(comebacks[comebacks.length - 1]))} (${hsEsc(comebacks[comebacks.length - 1].label)}, Rd ${comebacks[comebacks.length - 1].round}).` : "Rubbers won after losing the first set.")}
    ${biggest ? card("Biggest win", `+${biggest.gF - biggest.gA}`, `${hsEsc(who(biggest))} (${hsEsc(biggest.label)}) v ${hsEsc(biggest.opp)}, Rd ${biggest.round}: ${fmtSets(biggest)}.`) : ""}
    ${marathon ? card("Longest rubber", `${marathon.gF + marathon.gA} games`, `${hsEsc(who(marathon))} (${hsEsc(marathon.label)}) v ${hsEsc(marathon.opp)}, Rd ${marathon.round}: ${fmtSets(marathon)} — ${marathon.won ? "won" : "lost"}.`) : ""}
  </div>`;
}

function hsPairs(club, rubbers) {
  const P = {};
  rubbers.filter(r => r.type === "doubles" && r.players.length === 2).forEach(r => {
    const k = [...r.players].sort().join(" & ");
    const p = P[k] || (P[k] = { pair: [...r.players].sort(), team: r.label, w: 0, n: 0, gF: 0, gA: 0 });
    p.n++; if (r.won) p.w++; p.gF += r.gF; p.gA += r.gA;
  });
  const rows = Object.values(P).sort((a, b) => b.w - a.w || hsPct(b.gF, b.gA) - hsPct(a.gF, a.gA)).slice(0, 8);
  if (!rows.length) return `<p class="muted small">No doubles yet.</p>`;
  return rows.map(p => {
    const g = hsPct(p.gF, p.gA);
    return `<div class="cx-pair"><div class="cx-pair-names">${hsEsc(p.pair[0])}<span class="cx-amp">&amp;</span>${hsEsc(p.pair[1])} <span class="muted small">${hsEsc(p.team)}</span></div>
      <div class="cx-pair-rec">${p.w}-${p.n - p.w}</div><div class="cx-bar"><span style="width:${g}%" data-tip="${hsEsc(`Games ${p.gF}-${p.gA}`)}"></span></div><div class="cx-pair-g">${g}% games</div></div>`;
  }).join("");
}

function renderClubStats(club, teams) {
  const el = document.getElementById("club-stats");
  if (!el) return;
  const { rubbers, matches } = hsCollect(club, teams);
  if (!matches.length) { el.innerHTML = `<p class="muted">Stats appear once the first results are in.</p>`; return; }
  const P = hsPlayers(club, rubbers);
  const players = Object.values(P);
  players.forEach(p => p.homeLabel = hsTeamLabel(club, p.home) || [...p.teams][0] || "");

  const mW = matches.filter(m => m.won).length, rW = rubbers.filter(r => r.won).length;
  const setsW = rubbers.reduce((n, r) => n + r.sets.filter(([a, b]) => a > b).length, 0);
  const setsL = rubbers.reduce((n, r) => n + r.sets.filter(([a, b]) => b > a).length, 0);
  const gF = rubbers.reduce((n, r) => n + r.gF, 0), gA = rubbers.reduce((n, r) => n + r.gA, 0);
  const rounds = new Set(matches.map(m => m.round)).size;

  const minR = rounds >= 6 ? 4 : 2;
  const L = (key, filter = () => true) => players.filter(filter).map(p => ({ ...p, team: p.homeLabel, v: typeof key === "function" ? key(p) : p[key] }));
  const top = (rows, n = 5) => rows.filter(r => r.v > 0).sort((a, b) => b.v - a.v || b.rub - a.rub).slice(0, n);

  el.innerHTML = `
    <div class="hs-tiles">
      ${hsTile(`${mW}-${matches.length - mW}`, "Matches won-lost", `${hsPct(mW, matches.length - mW)}% across ${club.teams.length} teams`)}
      ${hsTile(`${hsPct(rW, rubbers.length - rW)}%`, "Rubbers won", `${rW} of ${rubbers.length}`)}
      ${hsTile(`${setsW}-${setsL}`, "Sets won-lost", `${hsPct(setsW, setsL)}% of sets`)}
      ${hsTile(gF.toLocaleString(), "Games won", `${hsPct(gF, gA)}% of ${(gF + gA).toLocaleString()} played`)}
      ${hsTile(players.length, "Players used", `${players.filter(p => p.teams.size > 1).length} have played for 2+ teams`)}
      ${hsTile(rounds, "Rounds played", `Results to ${club.resultsLoadedFromSite ? club.resultsLoadedFromSite.split(" @")[0] : "date"}`)}
    </div>

    <div class="card"><h2>Club form guide</h2><p class="muted small">Every Berwick team's result each round (match points). Hover or tap for the detail.</p>${hsFormGrid(club, matches)}</div>

    <div class="card"><h2>Season highlights</h2>${hsHighlights(rubbers)}</div>

    <div class="card"><h2>Leaderboards</h2><div class="hs-boards">
      ${hsLeader("Most rubbers won", "", top(L("w")), r => `${r.v} <span class="muted small">of ${r.rub}</span>`)}
      ${hsLeader("Best games won %", "", top(L("gp", p => p.rub >= minR)), r => `${r.v}%`, `Min. ${minR} rubbers.`)}
      ${hsLeader("Bagel bakers", "", top(L(p => p.bagels * 10 + p.bread)), r => `${r.bagels} · ${r.bread}`, "Sets won 6-0 · sets won 6-1.")}
      ${hsLeader("Ever-presents", "", top(L("matches")), r => `${r.v}`, "Matches played (any team).")}
      ${hsLeader("Clutch players", "", top(L(p => p.threeW * 10 + p.tbW)), r => `${r.threeW} · ${r.tbW}`, "Three-set rubbers won · tie-break (7-6) sets won.")}
      ${hsLeader("Most sets won", "", top(L("sF")), r => `${r.v}`, "Sets won.")}
    </div></div>

    <div class="card"><h2>Player map</h2>${hsScatter(players)}</div>

    <div class="card"><h2>Team scorecard</h2><p class="muted small">Share of rubbers won by each Berwick team, best first.</p>${hsTeamBars(club, rubbers)}</div>

    <div class="card"><h2>Where we win</h2>${hsSplit(rubbers)}</div>

    <div class="card"><h2>Best partnerships</h2><p class="muted small">Berwick doubles pairs across all teams, by rubbers won.</p>${hsPairs(club, rubbers)}</div>
  `;
}
