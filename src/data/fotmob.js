import { createHash } from "node:crypto";
import { httpGet } from "./titan.js";

const BASE = "https://www.fotmob.com/api/data";

function sha(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function getJson(url) {
  const res = await httpGet(url);
  if (!res.ok) return { ok: false, status: res.status, url, reason: `HTTP ${res.status}` };
  try {
    return { ok: true, json: JSON.parse(res.text), raw: res.text, hash: sha(res.text), url };
  } catch (err) {
    return { ok: false, status: res.status, url, reason: `JSON ${err.message}` };
  }
}

export async function matchesByDate(ymd) {
  const compact = ymd.replaceAll("-", "");
  return getJson(`${BASE}/matches?date=${compact}`);
}

export async function matchDetails(matchId) {
  return getJson(`${BASE}/matchDetails?matchId=${matchId}`);
}

export async function teamPage(teamId) {
  return getJson(`${BASE}/teams?id=${teamId}`);
}

export function lineupFromDetails(json) {
  const lu = json?.content?.lineup || json?.lineup || {};
  const type = lu.lineupType || lu?.homeTeam?.lineupType;
  const source = lu.predictedSource || lu.source || lu?.homeTeam?.source;
  return {
    lineupType: type,
    source,
    home: { lineupType: lu?.homeTeam?.lineupType || type, source },
    away: { lineupType: lu?.awayTeam?.lineupType || type, source },
    rawHashNote: type === "lastStarting11" ? "首发缺失（只有上一场首发）" : null,
  };
}

export function unavailableFromDetails(json) {
  const list = json?.content?.lineup?.unavailable || json?.unavailable || [];
  const players = [];
  for (const side of ["home", "away"]) {
    const arr = list[side] || list[`${side}Team`] || [];
    for (const p of arr) {
      const rawType = p.type || p.reason || p.injuryType;
      players.push({
        side,
        name: p.name || p.playerName,
        rawType,
        absence_type: rawType,
        internationalDuty: /international/i.test(String(rawType)),
        expectedReturn: p.expectedReturn || p.returnDate,
        id: p.id || p.playerId,
      });
    }
  }
  return players;
}

export function standingFromTable(row, leagueAbb) {
  if (!row) return null;
  const base = {
    played: row.played ?? row.p,
    rank: row.idx ?? row.rank ?? row.position,
    pts: row.pts,
    gap_promo: row.gap_promo,
    gap_rel: row.gap_rel,
    gap_title: row.gap_title,
    gap_acl: row.gap_acl,
  };
  if (leagueAbb === "美职" || leagueAbb === "MLS") {
    base.conference_rank = row.conference_rank ?? row.idx;
    base.pts_off_playoff = row.pts_off_playoff ?? row.ptsOffPlayoff;
  }
  return base;
}

export function fixturesAround(fixtures, kickoffTs) {
  const sorted = (fixtures || [])
    .filter((f) => !f.cancelled && !f.status?.cancelled)
    .map((f) => ({
      id: f.id,
      opponent: f.opponent?.name || f.away?.name || f.home?.name,
      tournament: f.tournament?.name || f.leagueName,
      kickoff: f.timeTS || f.status?.utcTime,
      finished: Boolean(f.status?.finished),
    }))
    .filter((f) => f.kickoff)
    .sort((a, b) => a.kickoff - b.kickoff);
  const t = Number(kickoffTs);
  const prev = [...sorted].reverse().find((f) => Number(f.kickoff) < t);
  const next = sorted.find((f) => Number(f.kickoff) > t);
  return { prev, next };
}

export async function startShareForTeam(teamId, leagueName, now = Date.now()) {
  const page = await teamPage(teamId);
  if (!page.ok) return { ok: false, reason: `扒不到：FotMob teams ${page.reason}` };
  const fixtures = page.json?.fixtures?.allFixtures?.fixtures || [];
  const finishedLeague = fixtures.filter((f) => {
    const lg = f.tournament?.name || "";
    return f.status?.finished && (!leagueName || lg.includes(leagueName));
  });
  const counts = new Map();
  const played = finishedLeague.length;
  for (const fx of finishedLeague) {
    const det = await matchDetails(fx.id);
    if (!det.ok) continue;
    const lu = det.json?.content?.lineup;
    if (lu?.lineupType !== "confirmed") continue;
    const sides = [lu.homeTeam, lu.awayTeam];
    for (const s of sides) {
      for (const p of s?.starters || s?.lineup || []) {
        const id = String(p.id || p.playerId);
        if (!id) continue;
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
  }
  const share = {};
  for (const [id, n] of counts) share[id] = played ? n / played : null;
  return { ok: true, played, share, fetched_at: new Date(now).toISOString(), hash: page.hash };
}

export async function tryFpl() {
  const res = await httpGet("https://fantasy.premierleague.com/api/bootstrap-static/");
  if (!res.ok) return { ok: false, reason: `扒不到：FPL ${res.status}` };
  return { ok: true, hash: sha(res.text), fetched_at: new Date().toISOString() };
}

export async function tryTransfermarkt() {
  const res = await httpGet("https://www.transfermarkt.com/");
  if (res.status === 403) return { ok: false, reason: "扒不到：Transfermarkt 403" };
  if (!res.ok) return { ok: false, reason: `扒不到：Transfermarkt ${res.status}` };
  return { ok: true };
}
