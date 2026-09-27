/**
 * 体彩只收浏览器本地选文件导入。兼容 sporttery_*pools_* / *results_*。
 */

export function teamName(x) {
  if (x == null) return "";
  if (typeof x === "string") return x;
  return x.teamName || x.name || x.fullName || x.teamNameCh || x.shortName || "";
}

export function unwrapList(payload) {
  if (!payload || typeof payload !== "object") return [];
  const root = payload.value || payload.data || payload.result || payload;
  const keys = [
    "matchInfoList",
    "matchList",
    "matchResultList",
    "resultList",
    "matches",
    "list",
    "poolList",
  ];
  for (const k of keys) {
    if (Array.isArray(root[k])) return root[k];
    if (Array.isArray(payload[k])) return payload[k];
  }
  if (Array.isArray(root)) return root;
  if (Array.isArray(payload.matches)) return payload.matches;
  return [];
}

export function guessBusinessDate(payload, filename = "", rows = []) {
  const top =
    payload.businessDate ||
    payload.business_date ||
    payload.saleDate ||
    payload.value?.businessDate ||
    payload.data?.businessDate;
  if (top) return String(top).slice(0, 10);
  const fromRow = rows.find((r) => r.businessDate || r.matchDate || r.saleDate);
  if (fromRow) return String(fromRow.businessDate || fromRow.matchDate || fromRow.saleDate).slice(0, 10);
  const m = String(filename).match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export function kickoffOf(raw) {
  if (raw.kickoffAt || raw.kickoff_at) return raw.kickoffAt || raw.kickoff_at;
  if (raw.timeTS) {
    const n = Number(raw.timeTS);
    if (Number.isFinite(n)) return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  }
  const d = raw.matchDate || raw.businessDate || raw.date;
  let t = raw.matchTime || raw.kickoffTime || raw.time;
  if (d && t) {
    t = String(t);
    if (/^\d{2}:\d{2}$/.test(t)) t = `${t}:00`;
    const iso = `${String(d).slice(0, 10)}T${t}+08:00`;
    const dt = new Date(iso);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  return raw.matchTime || null;
}

function pickPool(pools, raw, kind) {
  if (Array.isArray(pools)) {
    const hit = pools.find((p) => {
      const code = String(p.poolCode || p.poolType || p.type || p.pool || "").toLowerCase();
      return code === kind || code.includes(kind);
    });
    if (hit) return hit;
  }
  return raw[kind] || raw[kind.toUpperCase()] || null;
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function flag(single, key) {
  if (single == null) return "未知";
  if (typeof single === "boolean") return single ? "单关" : "仅串关";
  if (typeof single === "object") {
    const v = single[key];
    if (v === false) return "仅串关";
    if (v === true) return "单关";
    if (v === "停售" || single.poolStatus === "停售") return "停售";
  }
  if (single === "停售") return "停售";
  return String(single);
}

export function classifyFilename(name = "") {
  const n = String(name).toLowerCase();
  if (/result/.test(n)) return "results";
  if (/pool/.test(n) || /sporttery/.test(n)) return "pools";
  return "unknown";
}

export function normalizeImport(payload, receivedAt = new Date(), filename = "") {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "导入不是 JSON 对象" };
  }
  const rawList = unwrapList(payload);
  const businessDate = guessBusinessDate(payload, filename, rawList);
  if (!businessDate) {
    return { ok: false, error: "缺 businessDate", status: "销售日未接入" };
  }
  const rows = [];
  for (const raw of rawList) {
    const pools = raw.poolList || raw.pools || raw.pool || [];
    const had = pickPool(pools, raw, "had") || raw.had;
    const hhad = pickPool(pools, raw, "hhad") || raw.hhad;
    const home = teamName(raw.home || raw.homeTeam || raw.homeName);
    const away = teamName(raw.away || raw.awayTeam || raw.awayName);
    const jcId = raw.jcId || raw.matchNumStr || raw.matchNum || raw.numStr || raw.matchId || raw.id || raw.num;
    rows.push({
      jcId,
      businessDate: raw.businessDate || businessDate,
      leagueAbbName: raw.leagueAbbName || raw.leagueNameAbbr || raw.leagueName || raw.league,
      home,
      away,
      kickoffAt: kickoffOf(raw),
      matchDate: raw.matchDate,
      matchTime: raw.matchTime,
      hhad_line: raw.hhad_line ?? hhad?.goalLine ?? hhad?.line ?? hhad?.goal,
      had: had
        ? {
            home: num(had.h || had.home || had.win),
            draw: num(had.d || had.draw),
            away: num(had.a || had.away || had.lose),
            singleHome: flag(had.single || had.bettingSingle, "home"),
            singleDraw: flag(had.single || had.bettingSingle, "draw"),
            singleAway: flag(had.single || had.bettingSingle, "away"),
            poolStatus: had.poolStatus || had.status,
          }
        : null,
      hhad: hhad
        ? {
            home: num(hhad.h || hhad.home),
            draw: num(hhad.d || hhad.draw),
            away: num(hhad.a || hhad.away),
            single: hhad.single ?? hhad.bettingSingle,
            poolStatus: hhad.poolStatus || hhad.status,
          }
        : null,
      snapshot_at: raw.snapshot_at || payload.snapshot_at || receivedAt.toISOString(),
      imported: true,
      jc_points: had ? 3 : 0,
    });
  }
  return {
    ok: true,
    kind: "pools",
    filename,
    businessDate,
    receivedAt: receivedAt.toISOString(),
    count: rows.length,
    matches: rows,
    changed: [],
    saleFlip: [],
  };
}

export function normalizeResults(payload, filename = "") {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "赛果不是 JSON 对象" };
  }
  const rawList = unwrapList(payload);
  const rows = rawList.map((raw) => ({
    jcId: raw.jcId || raw.matchNumStr || raw.matchNum || raw.matchId || raw.id,
    home: teamName(raw.home || raw.homeTeam),
    away: teamName(raw.away || raw.awayTeam),
    league: raw.leagueAbbName || raw.leagueNameAbbr || raw.league,
    date: String(raw.matchDate || raw.businessDate || raw.date || "").slice(0, 10),
    homeScore: num(raw.homeScore ?? raw.hs ?? raw.fullHome),
    awayScore: num(raw.awayScore ?? raw.as ?? raw.fullAway),
    had: raw.hadResult || raw.had || raw.hadOutcome,
    hhad: raw.hhadResult || raw.hhad,
  }));
  return { ok: true, kind: "results", filename, count: rows.length, results: rows };
}

export function importReceipt(current, previous) {
  if (!current.ok) return { ok: false, error: current.error, red: true };
  const prevMap = new Map((previous?.matches || []).map((m) => [m.jcId, m]));
  const oddsChanged = [];
  const saleChanged = [];
  for (const m of current.matches || []) {
    const p = prevMap.get(m.jcId);
    if (!p) continue;
    if (JSON.stringify(p.had) !== JSON.stringify(m.had) || JSON.stringify(p.hhad) !== JSON.stringify(m.hhad)) {
      oddsChanged.push(m.jcId);
    }
    if (p.had?.poolStatus !== m.had?.poolStatus || p.had?.singleHome !== m.had?.singleHome) {
      saleChanged.push(m.jcId);
    }
  }
  return {
    ok: true,
    kind: current.kind || "pools",
    filename: current.filename,
    businessDate: current.businessDate,
    count: current.count,
    snapshots: (current.matches || []).map((m) => ({ jcId: m.jcId, snapshot_at: m.snapshot_at })),
    oddsChanged,
    saleChanged,
    red: false,
  };
}
