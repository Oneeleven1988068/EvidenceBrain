import { homeWinBy, oneXTwo } from "../calc/dixonColes.js";
import { lineCountGate } from "../calc/bookMu.js";

export const HHAD_NAMES = {
  "-4": "主让四球",
  "-3": "主让三球",
  "-2": "主让两球",
  "-1": "主让一球",
  "1": "主受让一球",
  "2": "主受让两球",
  "3": "主受让三球",
  "4": "主受让四球",
};

export function zName(hhadLine) {
  const key = String(hhadLine);
  if (HHAD_NAMES[key]) return HHAD_NAMES[key];
  const n = Number(hhadLine);
  if (!Number.isFinite(n)) return "让球";
  if (n < 0) return `主让${Math.abs(n)}球`;
  return `主受让${n}球`;
}

export function handicapIdentity(grid, market1x2, marketHhad, hhadLine) {
  const n = Math.abs(Number(hhadLine));
  const flags = [];
  if (!Number.isFinite(n) || n === 0) {
    return { flags, note: "让球数缺失、不结算", settle: false };
  }
  const mx = market1x2;
  const mh = marketHhad;
  if (hhadLine < 0) {
    if (mh.home + mh.draw - mx.home > 1e-9) flags.push("盘口不等式");
  } else if (mh.away + mh.draw - mx.away > 1e-9) {
    flags.push("盘口不等式");
  }

  if (n === 1) {
    if (hhadLine < 0) {
      const delta = Math.abs(mh.away - (mx.draw + mx.away)) * 100;
      if (delta > 1) flags.push("盘口两列来源不一致");
      return { flags, delta, note: "让一球：让负 ≈ 平+客胜", settle: true };
    }
    const delta = Math.abs(mh.home - (mx.home + mx.draw)) * 100;
    if (delta > 1) flags.push("盘口两列来源不一致");
    return { flags, delta, note: "受让一球：让胜 ≈ 主胜+平", settle: true };
  }

  const mid = hhadLine < 0
    ? homeWinBy(grid, 1, n - 1)
    : homeWinBy(
        grid.map((row, i) => row.map((p, j) => (i === j ? p : 0))),
        1,
        n - 1,
      );
  const modelMid = hhadLine < 0
    ? homeWinBy(grid, 1, n - 1)
    : (() => {
        let p = 0;
        for (let i = 0; i < grid.length; i++) {
          for (let j = 0; j < grid[i].length; j++) {
            const m = j - i;
            if (m >= 1 && m <= n - 1) p += grid[i][j];
          }
        }
        return p;
      })();

  const marketMid = hhadLine < 0
    ? mx.home - mh.home - mh.draw
    : mx.away - mh.away - mh.draw;
  const delta = Math.abs(modelMid - marketMid) * 100;
  if (delta > 2) flags.push("盘口两列来源不一致");
  return { flags, delta, modelMid, marketMid, note: `让${n}球净胜 1..${n - 1}`, settle: true };
}

export function teRuleApplies(hhadLine) {
  return Number.isFinite(Number(hhadLine)) && Math.abs(Number(hhadLine)) >= 1;
}

function itemState(item) {
  if (!item || item.status === "不适用") return "不适用";
  if (item.status === "已接入" || item.status === "公示无伤" || item.status === "有名单") return "已接入";
  if (item.status === "缺失" || item.status === "扒不到" || item.status === "伤停未抓取" || item.status === "名单无来源，不进 μ") {
    return "缺失";
  }
  if (item.entered === true) return "已接入";
  if (item.entered === false) return "缺失";
  return "缺失";
}

export function cellsFromProbs(model, market) {
  const keys = ["home", "draw", "away"];
  return keys.map((k) => ({
    key: k,
    model: model[k],
    market: market[k],
    diffPts: (model[k] - market[k]) * 100,
  }));
}

export function maxDev(cells) {
  return cells.reduce((best, c) => (Math.abs(c.diffPts) > Math.abs(best.diffPts) ? c : best), cells[0]);
}

export function rhoSensitivity(baseCells, loCells, hiCells) {
  return baseCells.map((c, i) => {
    const a = loCells[i].diffPts;
    const b = hiCells[i].diffPts;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const flip = a * b < 0;
    const weakEnd = Math.min(Math.abs(a), Math.abs(b)) < 0.5;
    const sensitive = flip || weakEnd;
    return {
      key: c.key,
      text: `${c.diffPts >= 0 ? "+" : ""}${c.diffPts.toFixed(1)}（ρ 取两端 ${lo.toFixed(1)} 到 ${hi.toFixed(1)}）`,
      sensitive,
    };
  });
}

export function verdictOf(input) {
  const items = {
    injury: itemState(input.injury),
    lineup: itemState(input.lineup),
    motive: itemState(input.motive),
    form: itemState(input.form || { status: "不适用" }),
    clean: itemState(input.clean || { status: "不适用" }),
    table: itemState(input.table || { status: "不适用" }),
    rotation: itemState(input.rotation || { status: "不适用" }),
  };
  const missing = Object.entries(items)
    .filter(([, v]) => v === "缺失")
    .map(([k]) => k);

  const flags = [...(input.flags || [])];
  if (input.identity?.flags) flags.push(...input.identity.flags);
  if (input.fitCheck && !input.fitCheck.pass) flags.push("盘口反推不一致");
  if (input.injuryAbnormal) flags.push("伤停扣减异常");
  if (input.goalsAssumed) flags.push("总进球为假设值");
  if (input.columnLagMinutes != null && input.columnLagMinutes > 30) {
    flags.push(`两列时差 ${Math.round(input.columnLagMinutes)} 分钟`);
  }

  const blocking = flags.some((f) =>
    /盘口反推不一致|盘口两列来源不一致|伤停扣减异常|总进球为假设值|两列时差/.test(f),
  );

  const lineGate = lineCountGate(input.ahCount || 0, input.ouCount || 0);
  const cells = input.cells || [];
  const peak = cells.length ? maxDev(cells) : { key: null, diffPts: 0 };
  const sensitive = (input.rhoSense || []).some((r) => r.sensitive);
  let tier;
  let title;

  if (missing.length) {
    tier = "no_ext";
    title = "盘外数据未接入";
  } else if (blocking) {
    tier = "blocked";
    title = "不出偏离结论";
  } else if (input.goalsAssumed) {
    tier = "blocked";
    title = "总进球为假设值，模型列不可用";
  } else if (Math.abs(peak.diffPts) >= 2 && lineGate.allowStrongDev && !sensitive) {
    tier = "dev";
    title = `有偏离 ${peak.key} ${peak.diffPts >= 0 ? "+" : ""}${peak.diffPts.toFixed(1)}`;
  } else if (Math.abs(peak.diffPts) >= 0.5) {
    tier = "weak";
    title = `倾向 ${peak.key} ${peak.diffPts >= 0 ? "+" : ""}${peak.diffPts.toFixed(1)}`;
  } else {
    tier = "flat";
    title = "确实无偏离";
  }

  if (sensitive && tier === "dev") {
    tier = "weak";
    title = `倾向 ${peak.key}（对 ρ 敏感）`;
    flags.push("对 ρ 敏感");
  }
  if (!lineGate.allowStrongDev && tier === "dev") {
    tier = "weak";
    title = `倾向 ${peak.key}（线不足）`;
  }

  const valueBets = (input.valueCells || []).filter((c) => c.ev > 0 && c.pool !== "停售");
  const canBet = input.week1 ? false : valueBets.length > 0 && input.jcStatus === "封盘价";
  const canBetLive = input.week1
    ? false
    : valueBets.length > 0 && (input.jcStatus === "封盘价" || input.jcStatus === "临盘");

  return {
    tier,
    title,
    peak,
    flags: [...new Set(flags)],
    missing,
    items,
    canBet: canBetLive,
    canBetLocked: canBet,
    canBetNote: input.week1
      ? "第一周可下格只记账、不标可下"
      : input.jcStatus === "临盘"
        ? "按临盘价照算，非封盘价"
        : canBet
          ? "可下"
          : "不可下",
    lineGate,
  };
}

export function oneXTwoFromGrid(grid) {
  return oneXTwo(grid);
}

export function settleHhadResult(homeGoals, awayGoals, hhadLine) {
  if (hhadLine == null || Number.isNaN(Number(hhadLine))) {
    return { ok: false, label: "让球数缺失、不结算" };
  }
  const margin = homeGoals - awayGoals + Number(hhadLine);
  if (margin > 0) return { ok: true, result: "home" };
  if (margin === 0) return { ok: true, result: "draw" };
  return { ok: true, result: "away" };
}
