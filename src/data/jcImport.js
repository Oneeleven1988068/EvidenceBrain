/**
 * 体彩只收浏览器本地导入。Item 46, 55.
 */

export function normalizeImport(payload, receivedAt = new Date()) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "导入不是 JSON 对象" };
  }
  const businessDate = payload.businessDate || payload.business_date || payload.saleDate;
  const matches = payload.matches || payload.list || payload.data || [];
  if (!businessDate) {
    return { ok: false, error: "缺 businessDate", status: "销售日未接入" };
  }
  const rows = [];
  const changed = [];
  const saleFlip = [];
  for (const raw of matches) {
    const jcId = raw.jcId || raw.matchId || raw.id || raw.num;
    const pools = raw.poolList || raw.pools || [];
    const had = pickPool(pools, raw, "had") || raw.had;
    const hhad = pickPool(pools, raw, "hhad") || raw.hhad;
    rows.push({
      jcId,
      businessDate,
      leagueAbbName: raw.leagueAbbName || raw.league,
      home: raw.home || raw.homeTeam,
      away: raw.away || raw.awayTeam,
      kickoffAt: raw.kickoffAt || raw.matchTime || raw.timeTS,
      matchDate: raw.matchDate,
      hhad_line: raw.hhad_line ?? hhad?.goalLine ?? hhad?.line,
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
    businessDate,
    receivedAt: receivedAt.toISOString(),
    count: rows.length,
    matches: rows,
    changed,
    saleFlip,
  };
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function pickPool(pools, raw, kind) {
  if (Array.isArray(pools)) {
    return pools.find((p) => String(p.poolType || p.type || "").toLowerCase().includes(kind));
  }
  return raw[kind];
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

export function importReceipt(current, previous) {
  if (!current.ok) return { ok: false, error: current.error, red: true };
  const prevMap = new Map((previous?.matches || []).map((m) => [m.jcId, m]));
  const oddsChanged = [];
  const saleChanged = [];
  for (const m of current.matches) {
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
    businessDate: current.businessDate,
    count: current.count,
    snapshots: current.matches.map((m) => ({ jcId: m.jcId, snapshot_at: m.snapshot_at })),
    oddsChanged,
    saleChanged,
    red: false,
  };
}
