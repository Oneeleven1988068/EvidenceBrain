/**
 * 体彩只收浏览器本地选文件导入。兼容 sporttery_*pools_* / *results_*。
 */

export function teamName(x) {
  if (x == null) return "";
  if (typeof x === "string") return x;
  return x.teamName || x.teamNameAbb || x.name || x.fullName || x.teamNameCh || x.shortName || "";
}

export function decodeSporttery(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (typeof payload.data === "string") {
    try {
      return JSON.parse(payload.data);
    } catch {
      return payload;
    }
  }
  if (payload.data && typeof payload.data === "object") return payload.data;
  return payload;
}

export function unwrapList(payload) {
  if (!payload || typeof payload !== "object") return [];
  const inner = decodeSporttery(payload);
  const value = inner.value || inner;
  if (Array.isArray(value.matchInfoList) && value.matchInfoList.some((d) => Array.isArray(d.subMatchList))) {
    return value.matchInfoList.flatMap((d) =>
      (d.subMatchList || []).map((m) => ({ ...m, businessDate: m.businessDate || d.businessDate })),
    );
  }
  if (Array.isArray(value.matchResult)) return value.matchResult;
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
    if (Array.isArray(value[k])) return value[k];
    if (Array.isArray(inner[k])) return inner[k];
    if (Array.isArray(payload[k])) return payload[k];
  }
  if (Array.isArray(value)) return value;
  if (Array.isArray(payload.matches)) return payload.matches;
  return [];
}

export function parseRank(label) {
  const m = String(label || "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function scoreTextOf(raw) {
  const text = [raw.sectionsNo999, raw.fullScore, raw.score].find((x) => typeof x === "string" && x.includes(":"));
  return text || null;
}

function scorePair(raw) {
  const text = scoreTextOf(raw);
  if (text) {
    const [h, a] = text.split(":").map((x) => Number(x));
    return { homeScore: Number.isFinite(h) ? h : null, awayScore: Number.isFinite(a) ? a : null };
  }
  return {
    homeScore: num(raw.homeScore ?? raw.hs ?? raw.fullHome),
    awayScore: num(raw.awayScore ?? raw.as ?? raw.fullAway),
  };
}

export function guessBusinessDate(payload, filename = "", rows = []) {
  const inner = decodeSporttery(payload) || {};
  const top =
    payload.businessDate ||
    payload.business_date ||
    payload.saleDate ||
    inner.businessDate ||
    inner.value?.businessDate ||
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
  if (single == null || single === "") return "未知";
  if (typeof single === "boolean") return single ? "单关" : "仅串关";
  if (typeof single === "number") return single === 1 ? "单关" : "仅串关";
  if (typeof single === "object") {
    const v = single[key];
    if (v === false || v === 0 || v === "0") return "仅串关";
    if (v === true || v === 1 || v === "1") return "单关";
    if (v === "停售" || single.poolStatus === "停售") return "停售";
  }
  const s = String(single);
  if (s === "1" || s === "true" || s === "单关") return "单关";
  if (s === "0" || s === "false" || s === "仅串关") return "仅串关";
  if (s === "停售") return "停售";
  return s;
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
    const had = raw.had || pickPool(pools, raw, "had");
    const hhad = raw.hhad || pickPool(pools, raw, "hhad");
    const home = raw.homeTeamAbbName || teamName(raw.home || raw.homeTeam || raw.homeName || raw.homeTeamAllName);
    const away = raw.awayTeamAbbName || teamName(raw.away || raw.awayTeam || raw.awayName || raw.awayTeamAllName);
    const jcId = raw.jcId || raw.matchNumStr || raw.matchNum || raw.numStr || raw.matchId || raw.id || raw.num;
    const homeRank = parseRank(raw.homeRank);
    const awayRank = parseRank(raw.awayRank);
    rows.push({
      jcId,
      businessDate: raw.businessDate || businessDate,
      leagueAbbName: raw.leagueAbbName || raw.leagueNameAbbr || raw.leagueName || raw.league,
      home,
      away,
      kickoffAt: kickoffOf(raw),
      matchDate: raw.matchDate,
      matchTime: raw.matchTime,
      homeRank: raw.homeRank || null,
      awayRank: raw.awayRank || null,
      standing: {
        home: { rank: homeRank, played: 0 },
        away: { rank: awayRank, played: 0 },
      },
      matchId: raw.matchId,
      hhad_line: raw.hhad_line ?? hhad?.goalLine ?? hhad?.goalLineValue ?? hhad?.line ?? hhad?.goal ?? null,
      had: had
        ? {
            home: num(had.h || had.home || had.win),
            draw: num(had.d || had.draw),
            away: num(had.a || had.away || had.lose),
            singleHome: flag(had.single ?? raw.bettingSingle, "home"),
            singleDraw: flag(had.single ?? raw.bettingSingle, "draw"),
            singleAway: flag(had.single ?? raw.bettingSingle, "away"),
            poolStatus: had.poolStatus || raw.matchStatus || had.status,
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
  const rows = rawList.map((raw) => {
    const score = scorePair(raw);
    const scoreText = scoreTextOf(raw);
    const hadOdds = {
      home: num(raw.h ?? raw.had?.h ?? raw.had?.home),
      draw: num(raw.d ?? raw.had?.d ?? raw.had?.draw),
      away: num(raw.a ?? raw.had?.a ?? raw.had?.away),
    };
    return {
      jcId: raw.jcId || raw.matchNumStr || raw.matchNum || raw.matchId || raw.id,
      home: raw.homeTeam || teamName(raw.home || raw.allHomeTeam),
      away: raw.awayTeam || teamName(raw.away || raw.allAwayTeam),
      league: raw.leagueNameAbbr || raw.leagueAbbName || raw.leagueName || raw.league,
      date: String(raw.matchDate || raw.businessDate || raw.date || "").slice(0, 10),
      homeScore: score.homeScore,
      awayScore: score.awayScore,
      scoreText,
      half: raw.sectionsNo1 || null,
      winFlag: raw.winFlag || null,
      goalLine: raw.goalLine || null,
      matchResultStatus: raw.matchResultStatus ?? null,
      poolStatus: raw.poolStatus || null,
      had: raw.hadResult || raw.hadOutcome || (hadOdds.home != null || hadOdds.draw != null || hadOdds.away != null ? hadOdds : raw.had || null),
      hhad: raw.hhadResult || raw.hhad || null,
    };
  });
  return { ok: true, kind: "results", filename, count: rows.length, results: rows };
}

export function mergeImported(existing, current) {
  const prev = new Map((existing || []).map((m) => [m.jcId || m.id, m]));
  return (current.matches || []).map((row) => {
    const existingRow = prev.get(row.jcId) || { id: row.jcId, jcId: row.jcId };
    return {
      ...existingRow,
      ...row,
      seed: false,
      id: existingRow.id || row.jcId,
      jc: {
        imported: true,
        jc_points: row.jc_points,
        snapshot_at: row.snapshot_at,
        had: row.had,
        hhad: row.hhad,
        hhad_line: row.hhad_line,
      },
      standing: row.standing || existingRow.standing || null,
      homeRank: row.homeRank || existingRow.homeRank || null,
      awayRank: row.awayRank || existingRow.awayRank || null,
      businessDate: row.businessDate,
      leagueAbbName: row.leagueAbbName || existingRow.leagueAbbName,
      kickoffAt: row.kickoffAt || existingRow.kickoffAt,
      home: row.home || existingRow.home,
      away: row.away || existingRow.away,
    };
  });
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
