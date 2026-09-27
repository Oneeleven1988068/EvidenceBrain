/**
 * Items 16–17, 20, 27, 47, 53.
 * lastStarting11 is 首发缺失, never 预测首发.
 */

export function lineupLabel(kind, extra = {}) {
  if (kind === "confirmed") {
    return {
      kind,
      text: extra.at ? `官方首发 ${extra.at}` : "官方首发",
      entered: true,
    };
  }
  if (kind === "predicted") {
    return {
      kind,
      text: `预测首发（来源 ${extra.source || "未知"}）`,
      entered: true,
      source: extra.source,
    };
  }
  return {
    kind: "missing",
    text: extra.onlyLast ? "首发缺失（只有上一场首发）" : "首发缺失",
    entered: false,
  };
}

export function lineupAtBet(raw) {
  const type = raw?.lineupType || raw?.type;
  if (type === "confirmed") return lineupLabel("confirmed", { at: raw.published_at_hkt });
  if (type === "predicted") {
    return lineupLabel("predicted", { source: raw.source || raw.predictedSource || "enetpulse" });
  }
  if (type === "lastStarting11") {
    return lineupLabel("missing", { onlyLast: true });
  }
  if (type === "partial") {
    return lineupLabel("missing");
  }
  return lineupLabel("missing");
}

export function perSideLineup(home, away) {
  const h = lineupAtBet(home);
  const a = lineupAtBet(away);
  const bothConfirmed = h.kind === "confirmed" && a.kind === "confirmed";
  const anyMissing = h.kind === "missing" || a.kind === "missing";
  return {
    home: h,
    away: a,
    residualFull: bothConfirmed,
    residualOk: !anyMissing,
    exportKind: [h.kind, a.kind],
  };
}

export function isLineupNews(item) {
  const text = `${item.title || ""} ${item.body || ""}`;
  const out = /确认不首发|确认缺阵|不上场|停赛|被排除/.test(text);
  const maybe = /可能轮换|或将轮换|考虑轮换/.test(text);
  if (out) return { kind: "out", enterMu: true };
  if (maybe) return { kind: "doubt", enterMu: true };
  return { kind: "note", enterMu: false };
}

export function rotationRisk(prevGapDays, nextGapDays, nextMoreImportant, side) {
  if (prevGapDays == null || nextGapDays == null) {
    return { status: "赛程未接入", enterMu: false, label: "赛程未接入" };
  }
  if (nextGapDays < 4 && nextMoreImportant) {
    return {
      status: "轮换风险",
      enterMu: false,
      label: `${side} 轮换风险：上一场 ${prevGapDays} 天前，下一场 ${nextGapDays} 天后更重要，未进 μ`,
      side,
    };
  }
  return { status: "无", enterMu: false, label: "赛程密度正常" };
}

export function rotationVsOfficial(predictedOut, officialOut) {
  const pred = predictedOut || [];
  const off = officialOut || [];
  const n = off.length;
  if (pred.length <= 2 && n >= 5) {
    return { flag: "轮换预判与首发不符", recompute: true, changed: n };
  }
  if (pred.length === 0 && n >= 5) {
    return { flag: "轮换预判与首发不符", recompute: true, changed: n };
  }
  if (pred.length >= 1 && pred.length <= 2 && n >= 1 && n <= 2) {
    return { flag: null, recompute: false, changed: n };
  }
  return { flag: null, recompute: n > 0, changed: n };
}
