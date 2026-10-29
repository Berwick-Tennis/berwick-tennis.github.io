/* Berwick Tennis Club — visual stats (team pages).
   A player cards · B ladder race · C winning margins · D match scoreboard
   E singles v doubles · F doubles partnerships · G section leaderboard.
   Uses globals from script.js (DATA, OUR_TEAM, canonName, escapeHtml, escapeAttr). */

const CX = { blue: "#3987e5", orange: "#d95926" };   // categorical slots 1-2, dark-surface steps

function cxPct(a, b) { return a + b ? Math.round((100 * a) / (a + b)) : null; }
function cxRounds() { return [...DATA.results].filter(r => typeof r.round === "number").sort((a, b) => a.round - b.round); }
function cxEsc(s) { return escapeAttr(escapeHtml(String(s ?? ""))); }

// Ladder (same tiebreaks as computeLadder) after the first n rounds
function cxLadderUpto(n) {
  const t = {};
  (DATA.teams || []).forEach(x => t[x] = { team: x, pts: 0, sF: 0, sA: 0, gF: 0, gA: 0 });
  cxRounds().slice(0, n).forEach(r => r.matches.forEach(m => {
    [["home", "away"], ["away", "home"]].forEach(([s, o]) => {
      const x = t[m[s]] || (t[m[s]] = { team: m[s], pts: 0, sF: 0, sA: 0, gF: 0, gA: 0 });
      x.pts += m[`${s}Pts`]; x.sF += m[`${s}S`]; x.sA += m[`${o}S`]; x.gF += m[`${s}G`]; x.gA += m[`${o}G`];
    });
  }));
  const p = (a, b) => (a + b ? a / (a + b) : 0);
  const L = Object.values(t).sort((a, b) => b.pts - a.pts || p(b.sF, b.sA) - p(a.sF, a.sA) || p(b.gF, b.gA) - p(a.gF, a.gA) || a.team.localeCompare(b.team));
  const out = {};
  L.forEach((x, i) => out[x.team] = { pos: i + 1, pts: x.pts });
  return out;
}

// Berwick's matches + per-player and per-pair rubber stats
function cxOurData() {
  const matches = [], players = {}, pairs = {};
  const P = n => players[n] || (players[n] = { name: n, w: 0, l: 0, sw: 0, sl: 0, dw: 0, dl: 0, gF: 0, gA: 0, sgF: 0, sgA: 0, dgF: 0, dgA: 0, form: [] });
  cxRounds().forEach(r => r.matches.forEach(m => {
    if (m.home !== OUR_TEAM && m.away !== OUR_TEAM) return;
    const s = m.home === OUR_TEAM ? "home" : "away", o = s === "home" ? "away" : "home";
    matches.push({ round: r.round, date: r.date, opp: m[o], home: s === "home", us: m[`${s}Pts`], them: m[`${o}Pts`], gF: m[`${s}G`], gA: m[`${o}G`], rubbers: m.rubbers || [], s, o });
    (m.rubbers || []).forEach(rb => {
      const mine = rb[`${s}Players`].map(canonName), theirs = rb[`${o}Players`];
      const won = rb.winner === s, gF = rb[`${s}Games`], gA = rb[`${o}Games`];
      const score = rb.sets.map(([a, b]) => (s === "home" ? `${a}-${b}` : `${b}-${a}`)).join(", ");
      mine.forEach(n => {
        const p = P(n);
        won ? p.w++ : p.l++; p.gF += gF; p.gA += gA;
        if (rb.type === "singles") { won ? p.sw++ : p.sl++; p.sgF += gF; p.sgA += gA; }
        else { won ? p.dw++ : p.dl++; p.dgF += gF; p.dgA += gA; }
        p.form.push({ r: r.round, won, type: rb.type, vs: theirs.join(" & "), score, partner: mine.find(x => x !== n) || null });
      });
      if (rb.type === "doubles") {
        const k = mine.join(" & ");
        const pr = pairs[k] || (pairs[k] = { pair: mine, w: 0, l: 0, gF: 0, gA: 0 });
        won ? pr.w++ : pr.l++; pr.gF += gF; pr.gA += gA;
      }
    });
  }));
  const regulars = DATA.roster.filter(p => !p.emergency).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).map(p => p.name);
  regulars.forEach(P);
  const extras = Object.keys(players).filter(n => !regulars.includes(n));   // emergencies who played for us
  return { matches, players, pairs, names: [...regulars, ...extras], extras };
}

function cxEmpty(msg) { return `<p class="muted">${msg}</p>`; }

/* ---------- A: player cards ---------- */
function cxCards(D) {
  const C = 2 * Math.PI * 26;
  return `<div class="cx-cards">${D.names.map(n => {
    const p = D.players[n], played = p.w + p.l, g = cxPct(p.gF, p.gA);
    const r = (DATA.roster || []).find(x => canonName(x.name) === n);
    const emerg = D.extras.includes(n);
    const form = p.form.map(f => `<span class="fp ${f.won ? "W" : "L"}" data-tip="${cxEsc(`Rd ${f.r} ${f.type}${f.partner ? " with " + f.partner : ""} v ${f.vs} — ${f.score}`)}">${f.won ? "W" : "L"}</span>`).join("");
    return `<div class="cx-pcard">
      <div class="cx-pc-top"><div class="cx-pc-name">${escapeHtml(n)}${emerg ? ` <span class="badge-e" title="Emergency">E</span>` : ""}</div><div class="cx-pc-order">${r && r.order ? "#" + r.order : ""}</div></div>
      <div class="cx-pc-main">
        <svg viewBox="0 0 64 64" class="cx-ring" role="img" aria-label="${p.w} of ${played} rubbers won">
          <circle cx="32" cy="32" r="26" class="cx-ring-bg"/>
          <circle cx="32" cy="32" r="26" class="cx-ring-fg" stroke-dasharray="${played ? (C * p.w / played).toFixed(1) : 0} ${C.toFixed(1)}" transform="rotate(-90 32 32)"/>
          <text x="32" y="37" text-anchor="middle" class="cx-ring-t">${p.w}-${p.l}</text>
        </svg>
        <dl class="cx-pc-stats">
          <div><dt>Games won</dt><dd>${g === null ? "–" : g + "%"}</dd></div>
          <div><dt>Singles</dt><dd>${p.sw}-${p.sl}</dd></div>
          <div><dt>Doubles</dt><dd>${p.dw}-${p.dl}</dd></div>
        </dl>
      </div>
      <div class="cx-form">${form || `<span class="muted small">No rubbers yet</span>`}</div>
    </div>`;
  }).join("")}</div>`;
}

/* ---------- B: ladder race ---------- */
function cxRace() {
  const R = cxRounds();
  if (R.length < 2) return cxEmpty("The ladder race appears after round 2.");
  const race = R.map((_, i) => cxLadderUpto(i + 1));
  const teams = Object.keys(race[race.length - 1]), T = teams.length;
  const W = 680, H = 40 + 34 * T, padL = 34, padR = 190, padT = 16, padB = 30;
  const x = i => padL + i * (W - padL - padR) / (R.length - 1);
  const y = pos => padT + (pos - 1) * (H - padT - padB) / (T - 1);
  const s = [`<svg viewBox="0 0 ${W} ${H}" class="cx-chart" role="img" aria-label="Ladder position after each round">`];
  for (let p = 1; p <= T; p++) {
    s.push(`<line x1="${padL}" x2="${W - padR}" y1="${y(p)}" y2="${y(p)}" class="cx-grid"/>`);
    s.push(`<text x="${padL - 10}" y="${y(p) + 4}" class="cx-tick" text-anchor="end">${p}</text>`);
  }
  if (T > 4) s.push(`<line x1="${padL}" x2="${W - padR}" y1="${(y(4) + y(5)) / 2}" y2="${(y(4) + y(5)) / 2}" class="cx-cutoff"/>`);
  R.forEach((r, i) => s.push(`<text x="${x(i)}" y="${H - 8}" class="cx-tick" text-anchor="middle">Rd ${r.round}</text>`));
  [...teams].sort((a, b) => (a === OUR_TEAM) - (b === OUR_TEAM)).forEach(t => {
    const us = t === OUR_TEAM;
    const pts = race.map((L, i) => [x(i), y(L[t] ? L[t].pos : T)]);
    s.push(`<path d="${pts.map(([a, b], j) => `${j ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join(" ")}" class="${us ? "cx-race-us" : "cx-race"}"/>`);
    pts.forEach(([a, b], i) => {
      const L = race[i][t] || { pos: T, pts: 0 };
      s.push(`<circle cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="${us ? 6 : 4.5}" class="${us ? "cx-dot-us" : "cx-dot"}" data-tip="${cxEsc(`${t} — #${L.pos} after Rd ${R[i].round} (${L.pts} pts)`)}"/>`);
    });
    const [lx, ly] = pts[pts.length - 1];
    s.push(`<text x="${lx + 12}" y="${ly + 4}" class="${us ? "cx-lab-us" : "cx-lab"}">${escapeHtml(t)} · ${race[race.length - 1][t].pts}</text>`);
  });
  s.push("</svg>");
  return `<div class="cx-wrap">${s.join("")}</div><p class="muted small">Position after each round (points shown at the end). ${T > 4 ? "Dashed line = finals cut (top 4)." : ""}</p>`;
}

/* ---------- C: winning margins ---------- */
function cxMargins(D) {
  const rows = D.matches;
  if (!rows.length) return cxEmpty("No results yet.");
  const W = 680, rowH = 56, padL = 170, padR = 56, padT = 10, padB = 26, H = padT + padB + rowH * rows.length;
  let mx = Math.max(10, ...rows.map(m => Math.abs(m.gF - m.gA))); mx = Math.ceil((mx + 1) / 5) * 5;
  const zero = padL + (W - padL - padR) / 2, sx = v => zero + v * (W - padL - padR) / 2 / mx;
  const s = [`<svg viewBox="0 0 ${W} ${H}" class="cx-chart" role="img" aria-label="Games won minus games lost each match">`];
  for (let v = -mx; v <= mx; v += 5) {
    s.push(`<line x1="${sx(v)}" x2="${sx(v)}" y1="${padT}" y2="${H - padB}" class="${v === 0 ? "cx-axis0" : "cx-grid"}"/>`);
    s.push(`<text x="${sx(v)}" y="${H - 8}" class="cx-tick" text-anchor="middle">${v > 0 ? "+" : ""}${v}</text>`);
  }
  rows.forEach((m, i) => {
    const diff = m.gF - m.gA, cy = padT + i * rowH + rowH / 2, win = m.us > m.them;
    const [x0, x1] = [sx(0), sx(diff)].sort((a, b) => a - b);
    s.push(`<text x="${padL - 12}" y="${cy - 3}" class="cx-lab" text-anchor="end">Rd ${m.round} ${m.home ? "v" : "@"} ${escapeHtml(m.opp)}</text>`);
    s.push(`<text x="${padL - 12}" y="${cy + 12}" class="cx-sub" text-anchor="end">${win ? "Won" : "Lost"} ${m.us}–${m.them} pts</text>`);
    s.push(`<rect x="${x0.toFixed(1)}" y="${(cy - rowH * 0.28).toFixed(1)}" width="${Math.max(2, x1 - x0).toFixed(1)}" height="${(rowH * 0.56).toFixed(1)}" rx="4" fill="${diff >= 0 ? CX.blue : CX.orange}" data-tip="${cxEsc(`Games ${m.gF}–${m.gA} (${diff >= 0 ? "+" : ""}${diff})`)}"/>`);
    s.push(`<text x="${(sx(diff) + (diff >= 0 ? 8 : -8)).toFixed(1)}" y="${cy + 4}" class="cx-val" text-anchor="${diff >= 0 ? "start" : "end"}">${diff >= 0 ? "+" : ""}${diff}</text>`);
  });
  s.push("</svg>");
  return `<div class="cx-wrap">${s.join("")}</div><div class="cx-legend"><span><i style="background:${CX.blue}"></i>More games won</span><span><i style="background:${CX.orange}"></i>More games lost</span></div>`;
}

/* ---------- D: match scoreboard ---------- */
function cxScoreboard(D) {
  if (!D.matches.length) return cxEmpty("No results yet.");
  return [...D.matches].reverse().map(m => {
    const tiles = m.rubbers.map(rb => {
      const won = rb.winner === m.s;
      const sets = rb.sets.map(([a, b]) => (m.s === "home" ? `${a}–${b}` : `${b}–${a}`)).join(" ");
      const who = rb[`${m.s}Players`].map(n => canonName(n).split(" ")[0]).join(" & ");
      return `<div class="cx-tile ${won ? "won" : "lost"}" data-tip="${cxEsc(`${rb[`${m.s}Players`].join(" & ")} v ${rb[`${m.o}Players`].join(" & ")}${rb.incomplete ? " (incomplete)" : ""}`)}">
        <span class="cx-tile-type">${rb.type === "singles" ? "S" : "D"}</span><span class="cx-tile-who">${escapeHtml(who)}</span>
        <span class="cx-tile-res">${won ? "W" : "L"}</span><span class="cx-tile-sets">${sets}</span></div>`;
    }).join("");
    return `<div class="cx-sb-row"><div><b>Rd ${m.round}</b> ${m.home ? "v" : "@"} ${escapeHtml(m.opp)} <span class="muted small">· ${m.us}–${m.them}</span></div>
      <div class="cx-sb-tiles" style="--n:${Math.min(4, m.rubbers.length)}">${tiles}</div></div>`;
  }).join("");
}

/* ---------- E: singles v doubles ---------- */
function cxSD(D) {
  const names = D.names.filter(n => D.players[n].w + D.players[n].l > 0);
  if (!names.length) return cxEmpty("No rubbers played yet.");
  const hasSingles = cxRounds().some(r => r.matches.some(m => (m.rubbers || []).some(rb => rb.type === "singles")));
  const W = 680, padL = 160, padR = 70, padT = 30, rowH = hasSingles ? 46 : 30, H = padT + rowH * names.length + 16;
  const sx = v => padL + v / 100 * (W - padL - padR);
  const s = [`<svg viewBox="0 0 ${W} ${H}" class="cx-chart" role="img" aria-label="Share of games won in singles and doubles">`];
  [0, 25, 50, 75, 100].forEach(v => {
    s.push(`<line x1="${sx(v)}" x2="${sx(v)}" y1="${padT - 6}" y2="${H - 16}" class="${v === 50 ? "cx-axis0" : "cx-grid"}"/>`);
    s.push(`<text x="${sx(v)}" y="${padT - 12}" class="cx-tick" text-anchor="middle">${v}%</text>`);
  });
  names.forEach((n, i) => {
    const p = D.players[n], cy = padT + i * rowH + 8;
    s.push(`<text x="${padL - 12}" y="${cy + 14}" class="cx-lab" text-anchor="end">${escapeHtml(n)}</text>`);
    const kinds = hasSingles ? [["s", CX.blue, "Singles"], ["d", CX.orange, "Doubles"]] : [["d", CX.orange, "Doubles"]];
    kinds.forEach(([k, col, lab], j) => {
      const gF = p[`${k}gF`], gA = p[`${k}gA`], w = p[`${k}w`], l = p[`${k}l`], v = cxPct(gF, gA), yy = cy + j * 15;
      if (v === null) { s.push(`<text x="${sx(0) + 4}" y="${yy + 9}" class="cx-sub">no ${lab.toLowerCase()} yet</text>`); return; }
      s.push(`<rect x="${sx(0)}" y="${yy}" width="${Math.max(2, sx(v) - sx(0)).toFixed(1)}" height="11" rx="4" fill="${col}" data-tip="${cxEsc(`${n} — ${lab}: ${w}-${l} rubbers, games ${gF}-${gA} (${v}%)`)}"/>`);
      s.push(`<text x="${(sx(v) + 6).toFixed(1)}" y="${yy + 10}" class="cx-val">${v}% <tspan class="cx-sub">(${w}-${l})</tspan></text>`);
    });
  });
  s.push("</svg>");
  if (!hasSingles) return `<div class="cx-wrap">${s.join("")}</div><p class="muted small">Share of games won in doubles (this section is all doubles), with the 50% line marked. Record in brackets.</p>`;
  return `<div class="cx-wrap">${s.join("")}</div><div class="cx-legend"><span><i style="background:${CX.blue}"></i>Singles</span><span><i style="background:${CX.orange}"></i>Doubles</span></div><p class="muted small">Share of games won in each format, with the 50% line marked. Record in brackets.</p>`;
}

/* ---------- F: doubles partnerships ---------- */
function cxPairs(D) {
  const rows = Object.values(D.pairs).sort((a, b) => (b.w - b.l) - (a.w - a.l) || b.gF / (b.gF + b.gA) - a.gF / (a.gF + a.gA));
  if (!rows.length) return cxEmpty("No doubles played yet.");
  return rows.map(p => {
    const g = cxPct(p.gF, p.gA);
    return `<div class="cx-pair"><div class="cx-pair-names">${escapeHtml(p.pair[0])}<span class="cx-amp">&amp;</span>${escapeHtml(p.pair[1] || "")}</div>
      <div class="cx-pair-rec">${p.w}-${p.l}</div>
      <div class="cx-bar"><span style="width:${g}%" data-tip="${cxEsc(`Games ${p.gF}-${p.gA}`)}"></span></div><div class="cx-pair-g">${g}% games</div></div>`;
  }).join("");
}

/* ---------- G: section leaderboard ---------- */
function cxBoard() {
  const all = {};
  cxRounds().forEach(r => r.matches.forEach(m => (m.rubbers || []).forEach(rb => {
    [["home", "away"], ["away", "home"]].forEach(([s, o]) => rb[`${s}Players`].forEach(n => {
      n = canonName(n);
      const k = `${n}::${m[s]}`;
      const a = all[k] || (all[k] = { name: n, team: m[s], gF: 0, gA: 0, n: 0, w: 0 });
      a.gF += rb[`${s}Games`]; a.gA += rb[`${o}Games`]; a.n++; if (rb.winner === s) a.w++;
    }));
  })));
  const min = cxRounds().length >= 6 ? 3 : 2;
  const rows = Object.values(all).filter(a => a.n >= min).sort((a, b) => b.gF / (b.gF + b.gA) - a.gF / (a.gF + a.gA) || b.n - a.n).slice(0, 15);
  if (!rows.length) return cxEmpty("The leaderboard appears once players have a couple of rubbers.");
  return `<div class="cx-lb-list">${rows.map((a, i) => {
    const g = cxPct(a.gF, a.gA), us = a.team === OUR_TEAM;
    return `<div class="cx-lb ${us ? "us" : ""}"><span class="cx-lb-rank">${i + 1}</span>
      <span class="cx-lb-name">${escapeHtml(a.name)} <span class="muted small">${escapeHtml(a.team)}</span></span>
      <span class="cx-bar"><span style="width:${g}%"></span></span><span class="cx-lb-val">${g}%</span><span class="muted small cx-lb-rec">${a.w}-${a.n - a.w}</span></div>`;
  }).join("")}</div><p class="muted small">Top 15 by share of games won (min. ${min} rubbers). Berwick players highlighted. Record = rubbers won-lost.</p>`;
}

function renderCharts() {
  const D = cxOurData();
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set("cx-cards", cxCards(D));
  set("cx-race", cxRace());
  set("cx-margins", cxMargins(D));
  set("cx-scoreboard", cxScoreboard(D));
  set("cx-sd", cxSD(D));
  set("cx-pairs", cxPairs(D));
  set("cx-board", cxBoard());
}

/* ---------- shared hover/tap tooltip for [data-tip] ---------- */
(() => {
  const tip = document.createElement("div");
  tip.id = "cx-tip"; tip.hidden = true;
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(tip));
  const show = (el, x, y) => {
    tip.textContent = el.getAttribute("data-tip"); tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(x + 14, innerWidth - r.width - 8)) + "px";
    tip.style.top = Math.max(8, y - r.height - 12) + "px";
  };
  ["pointermove", "pointerdown"].forEach(ev => document.addEventListener(ev, e => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el) show(el, e.clientX, e.clientY); else tip.hidden = true;
  }));
})();
