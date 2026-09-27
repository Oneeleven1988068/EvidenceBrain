import { gridOf, oneXTwo } from "./dixonColes.js";
import { ahFair, ouFair, winRateFromBuckets } from "./settle.js";

const COARSE = 0.05;
const FINE = 0.0005;

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export function quoteError(modelRate, marketRate) {
  return (modelRate - marketRate) * 100;
}

/**
 * Fit (λh, λa) to every Pinnacle AH + OU line at once.
 * Same ρ as the display matrix. Item 32–34, 51, 58.
 */
export function bookMu(lines, rho, options = {}) {
  const maxGoals = options.maxGoals ?? 10;
  const ah = (lines.ah || []).filter((l) => l.winRate != null && l.line != null);
  const ou = (lines.ou || []).filter((l) => l.winRate != null && l.line != null);
  if (ah.length + ou.length === 0) {
    return { ok: false, reason: "缺大小球", lambdaHome: null, lambdaAway: null };
  }

  const lossAt = (lh, la) => {
    const { grid } = gridOf(lh, la, rho, maxGoals);
    let sse = 0;
    for (const row of ah) {
      const model = ahFair(grid, row.line).winRate;
      const e = model - row.winRate;
      sse += e * e;
    }
    for (const row of ou) {
      const model = ouFair(grid, row.line, row.side || "over").winRate;
      const e = model - row.winRate;
      sse += e * e;
    }
    return { sse, grid };
  };

  let best = { sse: Infinity, lh: 1.2, la: 1.1 };
  for (let lh = 0.3; lh <= 3.6; lh += COARSE) {
    for (let la = 0.3; la <= 3.6; la += COARSE) {
      const { sse } = lossAt(lh, la);
      if (sse < best.sse) best = { sse, lh, la };
    }
  }

  const span = COARSE;
  for (let lh = best.lh - span; lh <= best.lh + span + 1e-12; lh += FINE) {
    for (let la = best.la - span; la <= best.la + span + 1e-12; la += FINE) {
      if (lh <= 0.05 || la <= 0.05) continue;
      const { sse } = lossAt(lh, la);
      if (sse < best.sse) best = { sse, lh, la };
    }
  }

  const { grid } = gridOf(best.lh, best.la, rho, maxGoals);
  const oneX = oneXTwo(grid);
  const back = [];
  for (const row of ah) {
    const model = ahFair(grid, row.line);
    back.push({
      kind: "ah",
      line: row.line,
      market: row.winRate,
      model: model.winRate,
      errorPts: quoteError(model.winRate, row.winRate),
      buckets: model,
    });
  }
  for (const row of ou) {
    const model = ouFair(grid, row.line, row.side || "over");
    back.push({
      kind: "ou",
      line: row.line,
      side: row.side || "over",
      market: row.winRate,
      model: model.winRate,
      errorPts: quoteError(model.winRate, row.winRate),
      buckets: model,
    });
  }

  return {
    ok: true,
    lambdaHome: best.lh,
    lambdaAway: best.la,
    rho,
    sse: best.sse,
    grid,
    oneXTwo: oneX,
    back,
  };
}

export function residualCheck(fit, euro, gates = { euroPts: 0.7, linePts: 1.1 }) {
  if (!fit.ok) return { pass: false, reason: fit.reason, flags: ["盘口反推不一致"] };
  const flags = [];
  const euroDiffs = euro
    ? {
        home: (fit.oneXTwo.home - euro.home) * 100,
        draw: (fit.oneXTwo.draw - euro.draw) * 100,
        away: (fit.oneXTwo.away - euro.away) * 100,
      }
    : null;
  if (euroDiffs) {
    const worst = Math.max(
      Math.abs(euroDiffs.home),
      Math.abs(euroDiffs.draw),
      Math.abs(euroDiffs.away),
    );
    if (worst > gates.euroPts) flags.push("盘口反推不一致");
  }
  const worstLine = Math.max(0, ...fit.back.map((r) => Math.abs(r.errorPts)));
  if (worstLine > gates.linePts) flags.push("盘口反推不一致");
  return {
    pass: flags.length === 0,
    flags,
    euroDiffs,
    worstLine,
    independentBack: fit.back.map((r) => ({
      ...r,
      independentWinRate: winRateFromBuckets(r.buckets),
    })),
  };
}

export function lineCountGate(ahCount, ouCount) {
  const total = ahCount + ouCount;
  if (total < 5) {
    return {
      allowStrongDev: false,
      maxTier: "weak",
      reason: `亚盘+大小球共 ${total} 条，少于 5 条，不出有偏离`,
    };
  }
  return { allowStrongDev: true, maxTier: "dev", reason: null };
}

export function rhoPrior(value) {
  const clipped = clamp(value ?? -0.08, -0.18, -0.03);
  return { rho: clipped, label: "临时先验", range: [-0.18, -0.03] };
}
