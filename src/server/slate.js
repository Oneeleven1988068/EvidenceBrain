import { analyzeMatch } from "../model/pipeline.js";
import { classify } from "../league/catalog.js";
import { closeAt, importWindowsForDay, nextImportWindow } from "../calc/closeAt.js";
import { formatHkt, formatHktDateTime } from "../calc/time.js";

export function buildSlate(rawMatches, now = new Date()) {
  const analyzed = rawMatches.map((m) => analyzeMatch(m, now));
  const windows = importWindowsForDay(
    analyzed.map((a, i) => ({
      id: rawMatches[i].jcId || rawMatches[i].id,
      close_at: a.close.close_at,
    })),
    now,
  );
  const next = nextImportWindow(windows, now);
  const groups = new Map();
  for (const a of analyzed) {
    const key = a.close.close_at || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  return {
    generatedAt: now.toISOString(),
    generatedAtHkt: formatHktDateTime(now),
    nextImport: next,
    windows,
    matches: analyzed,
    groups: [...groups.entries()].map(([close_at, rows]) => ({
      close_at,
      closeHkt: close_at ? formatHktDateTime(close_at) : "封盘时点未知",
      rows,
    })),
  };
}

export function exportDay(slate) {
  return {
    exportedAt: slate.generatedAt,
    exportedAtHkt: slate.generatedAtHkt,
    matches: slate.matches.map((a) => ({
      id: a.id,
      jcId: a.jcId,
      businessDate: a.close.businessDate,
      close_at: a.close.close_at,
      snapshot_at: a.jc.snapshot_at,
      p_close_at: a.pinChangedAt,
      p_model: a.modelAdj,
      p_market: a.market1x2,
      dev_cell: a.verdict.peak,
      adj_log: {
        injury: a.injState,
        motive: { home: a.motiveHome, away: a.motiveAway, pair: a.motivePair },
        lambda: { home: a.lambdaHome, away: a.lambdaAway },
        lineup: a.lineup,
      },
      jc_status: a.jc.status,
      verdict: a.verdict,
      league: classify(a.league.name).name,
      name_map_ok: a.nameMap?.ok ?? false,
    })),
  };
}

export function boardStats(history) {
  const rows = (history || []).filter((r) => r.settled);
  const take = (fn) => {
    const xs = rows.map(fn).filter((x) => x != null);
    if (xs.length < 8) return { n: xs.length, note: "样本不足" };
    return { n: xs.length, rate: xs.reduce((s, x) => s + x, 0) / xs.length };
  };
  return {
    trendHit: take((r) => (r.tier === "dev" ? (r.devHit ? 1 : 0) : null)),
    ticketHit: take((r) => (r.ticketHit ? 1 : 0)),
    weakHit: take((r) => (r.tier === "weak" ? (r.weakHit ? 1 : 0) : null)),
  };
}

export { closeAt, formatHkt, formatHktDateTime };
