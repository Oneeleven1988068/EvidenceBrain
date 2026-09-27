/**
 * 广实推论。档不是现成库，先钉中游，再用开盘和盘能反推。
 * 第一篇：档位不是排名；当轮权威表算差；数学广实只校准、不能越权；
 * 一场球可以提醒，不能单独判刑。
 * 第二篇：GD=客档−主档；符号定强弱，绝对值看差距，分布定热度，赔率验方向。
 * 第三段：广实定位=硬实力+近况+市场形象的综合评估，必须动态看，是分析策略。
 * 打分不看赔率。对照价格时不改盘口 μ。
 */
import { gridOf, oneXTwo } from "../calc/dixonColes.js";
import { ahFair } from "../calc/settle.js";
import { impliedWinRate, FORMAT_HK } from "../calc/odds.js";
import {
  MIDTABLE,
  clampTier,
  describeDiff,
  guangshiDiff,
  leagueTierSpan,
  nameOf,
  parseTierName,
} from "../league/tiers.js";
import { classify } from "../league/catalog.js";

export const INTERVALS = {
  0: { name: "零区", ah: 0.25, note: "杯赛/首回合常落这里" },
  1: { name: "一区间", ah: 0, note: "客高半档 → 平手" },
  2: { name: "二区间", ah: -0.25, note: "同档 → 平半；客高一档 → 客让平半" },
  3: { name: "三区间", ah: -0.5, note: "主高半档 → 半球" },
  4: { name: "四区间", ah: -0.75, note: "主高一档 → 半一" },
  5: { name: "五区间", ah: -1, note: "主高 1.5 档 → 一球" },
};

/** 威廉 94 系锚点：2.20 二区间、1.95 三区间、1.62 五区间。 */
export function williamInterval(decimal) {
  const d = Number(decimal);
  if (!Number.isFinite(d)) return null;
  if (d >= 2.50) return { n: 0, name: "零区", odds: d };
  if (d >= 2.32) return { n: 1, name: "一区间", odds: d };
  if (d >= 2.07) return { n: 2, name: "二区间", odds: d };
  if (d >= 1.78) return { n: 3, name: "三区间", odds: d };
  if (d >= 1.68) return { n: 4, name: "四区间", odds: d };
  if (d >= 1.52) return { n: 5, name: "五区间", odds: d };
  return { n: 6, name: "六区间", odds: d };
}

/**
 * 广实差 → 应开区间和应开亚盘（主队视角，负线=主让）。
 * 客队更强时整表下移。区间表只铺到 ±1.5 档，再大的数字差按 ±2 封顶，
 * 所以宫利这种客高 4 档也只读成「至少让 0.75」。
 */
export function intervalFromDiff(diff) {
  if (diff == null) return null;
  const capped = Math.max(-2, Math.min(2, diff));
  const homeStrongerBy = capped;
  const actualBy = diff;
  const gapLabel = actualBy === 0 ? "同档" : actualBy > 0 ? `主强${actualBy}档` : `客强${-actualBy}档`;
  if (homeStrongerBy === 0) {
    return { n: 2, name: "二区间", expectedAh: -0.25, label: `${gapLabel} · 平半` };
  }
  if (homeStrongerBy === 0.5) {
    return { n: 3, name: "三区间", expectedAh: -0.5, label: `${gapLabel} · 半球` };
  }
  if (homeStrongerBy === 1) {
    return { n: 4, name: "四区间", expectedAh: -0.75, label: `${gapLabel} · 半一` };
  }
  if (homeStrongerBy === 1.5) {
    return { n: 5, name: "五区间", expectedAh: -1, label: `${gapLabel} · 一球` };
  }
  if (homeStrongerBy === -0.5) {
    return { n: 1, name: "一区间", expectedAh: 0, label: `${gapLabel} · 平手` };
  }
  if (homeStrongerBy === -1) {
    return { n: 2, name: "二区间", expectedAh: 0.25, label: `${gapLabel} · 客让平半` };
  }
  if (homeStrongerBy > 1.5) {
    const extra = homeStrongerBy - 1.5;
    const ah = -(1 + extra * 0.5);
    return { n: 5 + extra, name: "五区间+", expectedAh: ah, label: `${gapLabel} · 至少让 ${Math.abs(ah)}` };
  }
  const extra = -homeStrongerBy - 1;
  const ah = 0.25 + extra * 0.5;
  return { n: 1 - extra, name: "一区间-", expectedAh: ah, label: `${gapLabel} · 至少让 ${Math.abs(ah)}` };
}

export function lockMidtable({ fiveYearRanks, titleOdds, titleOddsMid = 501 } = {}) {
  const locked = [];
  if (Array.isArray(titleOdds)) {
    for (const row of titleOdds) {
      if (Number(row.odds) >= titleOddsMid) {
        locked.push({
          team: row.team,
          num: MIDTABLE,
          name: "中游",
          source: `赛季前夺冠赔率 ${row.odds}`,
        });
      }
    }
  }
  if (Array.isArray(fiveYearRanks) && fiveYearRanks.length) {
    const avg = fiveYearRanks.map((t) => ({
      team: t.team,
      avg: (t.ranks || []).reduce((s, x) => s + x, 0) / (t.ranks?.length || 1),
    }));
    avg.sort((a, b) => a.avg - b.avg);
    const midStart = Math.floor(avg.length * 0.4);
    const midEnd = Math.ceil(avg.length * 0.6);
    for (const row of avg.slice(midStart, midEnd)) {
      if (!locked.some((x) => x.team === row.team)) {
        locked.push({
          team: row.team,
          num: MIDTABLE,
          name: "中游",
          source: `近五年排名均值 ${row.avg.toFixed(1)}`,
        });
      }
    }
  }
  return locked;
}

export function lineToHomeStronger(openingAh) {
  const line = Number(openingAh);
  if (!Number.isFinite(line)) return null;
  const table = {
    "-0.25": 0,
    "-0.5": 0.5,
    "-0.75": 1,
    "-1": 1.5,
    0: -0.5,
    0.25: -1,
    0.5: -1.5,
  };
  if (table[String(line)] != null || table[line] != null) {
    return table[String(line)] ?? table[line];
  }
  if (line < -1) return 1.5 + (-line - 1) * 2;
  if (line > 0.5) return -1.5 - (line - 0.5) * 2;
  return null;
}

/** 对已知中游（或已定档）的开盘让步，反推本队档。 */
export function inferFromOpening({ selfIsHome, openingAh, knownOppNum, span }) {
  if (openingAh == null || knownOppNum == null) return null;
  const homeStrongerBy = lineToHomeStronger(openingAh);
  if (homeStrongerBy == null) return null;
  const raw = selfIsHome ? knownOppNum - homeStrongerBy : knownOppNum + homeStrongerBy;
  const num = clampTier(raw, span || { min: 1, max: 11 });
  return {
    num,
    name: nameOf(num),
    source: `对档${knownOppNum}开 ${openingAh}，反推`,
    homeStrongerBy,
  };
}

/**
 * 多轮反推：先钉死中游，再拿对中游的开盘推第一轮，
 * 再用已定档的队推剩下的。没有近六场积分公式。
 */
export function buildLadder({ titleOdds, fiveYearRanks, openings = [], span } = {}) {
  const locked = lockMidtable({ titleOdds, fiveYearRanks });
  const tiers = new Map();
  for (const row of locked) {
    tiers.set(row.team, { num: row.num, name: row.name, source: row.source, locked: true, round: 0 });
  }
  const inferred = [];
  let progress = true;
  let rounds = 0;
  while (progress && rounds < 8) {
    progress = false;
    rounds += 1;
    const known = new Map(tiers);
    const newly = [];
    for (const g of openings) {
      const homeKnown = known.get(g.home);
      const awayKnown = known.get(g.away);
      if (homeKnown && !awayKnown && !newly.some((x) => x.team === g.away)) {
        const inf = inferFromOpening({
          selfIsHome: false,
          openingAh: g.openingAh,
          knownOppNum: homeKnown.num,
          span,
        });
        if (inf) newly.push({ team: g.away, ...inf });
      } else if (awayKnown && !homeKnown && !newly.some((x) => x.team === g.home)) {
        const inf = inferFromOpening({
          selfIsHome: true,
          openingAh: g.openingAh,
          knownOppNum: awayKnown.num,
          span,
        });
        if (inf) newly.push({ team: g.home, ...inf });
      }
    }
    for (const row of newly) {
      tiers.set(row.team, { ...row, locked: false, round: rounds });
      inferred.push({ ...row, round: rounds });
      progress = true;
    }
  }
  return { locked, inferred, tiers: Object.fromEntries(tiers), rounds };
}

/**
 * 盘能：两队打同一第三者，主胜更低的高半档。
 * 再按对手强度反推「假如换对手」的胜率，避免打弱队刷分。
 */
export function panNeng(teamA, teamB) {
  const common = intersectOpponents(teamA.results || [], teamB.results || []);
  if (!common.length) {
    return { ok: false, reason: "没有共同对手", delta: 0 };
  }
  let aWins = 0;
  let bWins = 0;
  const rows = [];
  for (const opp of common) {
    const a = teamA.results.find((r) => r.opp === opp);
    const b = teamB.results.find((r) => r.opp === opp);
    const aHomeWin = a.homeWinOdds;
    const bHomeWin = b.homeWinOdds;
    if (aHomeWin != null && bHomeWin != null) {
      if (aHomeWin < bHomeWin) aWins += 1;
      else if (bHomeWin < aHomeWin) bWins += 1;
    }
    const aRate = resultRate(a);
    const bRate = resultRate(b);
    rows.push({ opp, aHomeWin, bHomeWin, aRate, bRate });
  }
  const aSos = strengthOfSchedule(teamA.results);
  const bSos = strengthOfSchedule(teamB.results);
  const aAdj = (aWins / common.length) * (aSos || 1);
  const bAdj = (bWins / common.length) * (bSos || 1);
  let delta = 0;
  if (aAdj > bAdj + 0.08) delta = -0.5;
  else if (bAdj > aAdj + 0.08) delta = 0.5;
  return {
    ok: true,
    common: common.length,
    rows,
    aAdj,
    bAdj,
    delta,
    note: delta < 0 ? "A 高半档" : delta > 0 ? "B 高半档" : "盘能打平",
  };
}

function intersectOpponents(a, b) {
  const bs = new Set(b.map((r) => r.opp));
  return [...new Set(a.map((r) => r.opp).filter((o) => bs.has(o)))];
}

function resultRate(r) {
  if (!r) return 0;
  if (r.winRate != null) return r.winRate;
  if (r.gf == null) return 0;
  if (r.gf > r.ga) return 1;
  if (r.gf === r.ga) return 0.33;
  return 0;
}

function strengthOfSchedule(results) {
  if (!results?.length) return 1;
  const opp = results.map((r) => r.oppNum ?? MIDTABLE);
  const mean = opp.reduce((s, x) => s + x, 0) / opp.length;
  return mean / MIDTABLE;
}

/** 人气底蕴：名门掉档慢，无底蕴涨档慢。 */
export function applyPedigree(instantNum, prestigeNum, pedigree = 0) {
  if (instantNum == null) return prestigeNum ?? null;
  if (prestigeNum == null) return instantNum;
  const delta = instantNum - prestigeNum;
  const riseCap = pedigree >= 0.3 ? 1 : 1;
  const dropCap = pedigree >= 0.6 ? 1 : pedigree >= 0.3 ? 1.5 : 3;
  const clamped = prestigeNum + Math.max(-riseCap, Math.min(dropCap, delta));
  return clamped;
}

export function formPoints(matches, selfNum, { lastN = 5, strip = true } = {}) {
  const slice = (matches || []).slice(0, lastN);
  let pts = 0;
  let stripped = 0;
  const kept = [];
  for (const m of slice) {
    const win = m.gf > m.ga;
    const draw = m.gf === m.ga;
    const raw = win ? 3 : draw ? 1 : 0;
    const gap = (m.oppNum ?? MIDTABLE) - (selfNum ?? MIDTABLE);
    if (strip && win && gap >= 2) {
      stripped += 3;
      continue;
    }
    pts += raw;
    kept.push(m);
  }
  return { pts, stripped, n: slice.length, kept, max: lastN * 3 };
}

/**
 * 表面战绩 vs 对手含金量。赢弱队的分不当硬仗，强队身上拿的分才算金。
 * 克罗地亚近6场3胜3负账面9分，赢的全是弱队、强硬仗0分；加纳账面少4分，却从强队拿了1分。
 */
export function opponentQuality(matches, selfNum) {
  const rows = matches || [];
  let surfacePts = 0;
  let goldPts = 0;
  let cheapWins = 0;
  let vsStrong = 0;
  let vsStrongPts = 0;
  for (const m of rows) {
    if (m?.gf == null || m?.ga == null) continue;
    const win = m.gf > m.ga;
    const draw = m.gf === m.ga;
    const pts = win ? 3 : draw ? 1 : 0;
    surfacePts += pts;
    const opp = m.oppNum ?? MIDTABLE;
    const self = selfNum ?? MIDTABLE;
    const muchWeaker = opp - self >= 2;
    const tough = opp <= self + 0.5;
    if (muchWeaker && win) cheapWins += 1;
    if (tough) {
      vsStrong += 1;
      vsStrongPts += pts;
      goldPts += pts;
    }
  }
  let note = "对手质量已拆开";
  if (cheapWins && vsStrong && vsStrongPts === 0) {
    note = "赢的全是弱队，强硬仗没拿分，账面战绩含金量不足";
  } else if (cheapWins) {
    note = "表面战绩混着打弱队的分，对手质量要拆开看";
  }
  return {
    n: rows.length,
    surfacePts,
    goldPts,
    cheapWins,
    vsStrong,
    vsStrongPts,
    maxGold: vsStrong * 3,
    note,
  };
}

/**
 * 逐轮改档。第一轮是起点。一场球只提醒，连续证据或阵容真变了才最多改半档。
 * 上一轮偏了，下一轮拿到证据修回来；不能为面子守旧，也不能一场来回跳。
 */
export function reviseAuthority({
  prevNum,
  proposedNum,
  consecutiveSameDirection = false,
  squadChanged = false,
  opponentGifted = false,
  lastRoundBiased = false,
} = {}) {
  if (prevNum == null && proposedNum == null) {
    return { num: null, role: "未定", note: "还没有档" };
  }
  if (prevNum == null) {
    return { num: proposedNum, role: "起点", note: "第一轮的档位是起点" };
  }
  if (proposedNum == null) {
    return { num: prevNum, role: "维持", note: "本轮没有新证据" };
  }
  const delta = Number(proposedNum) - Number(prevNum);
  if (delta === 0) {
    return { num: prevNum, role: "维持", note: "本轮不改档" };
  }
  if (opponentGifted && !consecutiveSameDirection && !squadChanged) {
    return {
      num: prevNum,
      role: "提醒",
      proposedNum,
      note: "对手刚好送出机会，一场球可以提醒，不能单独判刑",
    };
  }
  if (!consecutiveSameDirection && !squadChanged && !lastRoundBiased) {
    return {
      num: prevNum,
      role: "提醒",
      proposedNum,
      note: "一场球可以提醒，不能单独判刑",
    };
  }
  const step = Math.sign(delta) * Math.min(0.5, Math.abs(delta));
  return {
    num: Number(prevNum) + step,
    role: lastRoundBiased ? "修正偏估" : "逐轮维护",
    moved: step,
    proposedNum,
    note: lastRoundBiased
      ? "上一轮偏了，本轮拿到证据修回来"
      : "连续证据或阵容变化，本轮最多改半档",
  };
}

/** 数学广实评分→档，区间先锁死。第二篇公式未到，不用排名当实力。 */
export const MATH_BANDS = [
  { min: 0.88, num: 1 },
  { min: 0.78, num: 2 },
  { min: 0.68, num: 3 },
  { min: 0.58, num: 4 },
  { min: 0.48, num: 5 },
  { min: 0.38, num: 6 },
  { min: 0.28, num: 7 },
  { min: 0.18, num: 8 },
  { min: 0, num: 9 },
];

export function mathMapScore(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const s = Math.max(0, Math.min(1, Number(score)));
  for (const b of MATH_BANDS) {
    if (s >= b.min) return b.num;
  }
  return 9;
}

export function mathGuangshi(side = {}) {
  const gd = normGd(side.gf, side.ga, side.played);
  const q = opponentQuality(side.season || side.recent || [], side.tierNum);
  const goldN = q.maxGold ? q.goldPts / q.maxGold : q.n ? 0 : null;
  if (gd == null && goldN == null) {
    return {
      status: "未接入",
      role: "校准",
      formula: "待第二篇",
      reason: "缺赛季主客场表现",
      quality: q,
    };
  }
  const score = gd != null && goldN != null ? 0.55 * gd + 0.45 * goldN : (gd ?? goldN);
  const num = mathMapScore(score);
  return {
    status: "已计算",
    role: "校准",
    num,
    name: nameOf(num),
    score,
    quality: q,
    formula: "待第二篇锁公式；现只用赛季进失+对手含金量，不用排名当实力",
  };
}

export function mathCannotOverride(authorityNum, mathNum) {
  if (authorityNum == null || mathNum == null) {
    return { override: false, drift: null, note: "数学广实不能越过权威替它做决定" };
  }
  const drift = Number(mathNum) - Number(authorityNum);
  return {
    override: false,
    drift,
    halfTier: Math.abs(drift) >= 0.5,
    note: Math.abs(drift) >= 0.5
      ? "数学广实提醒偏了半档以上，不能越过权威替它做决定"
      : "数学广实只校准，单轮差仍读当轮权威表",
  };
}

export function rankSituation(rank, teams, authNum) {
  if (rank == null || authNum == null) return null;
  const size = teams || 20;
  const panic = rank >= size - 2 && authNum <= MIDTABLE;
  return {
    kind: panic ? "排名恐慌" : "排名不是实力",
    rank,
    authNum,
    note: panic
      ? "排名制造恐慌时提醒：处境很危险，真正实力位置没有一起掉下去"
      : "排名记录的是已经拿到的分，混着赛程对手运气，不当实力档",
  };
}

export function seasonPhase(played, rounds) {
  if (!rounds || played == null) {
    return { phase: "未知", authorityLabel: "当轮权威表" };
  }
  if (played < Math.ceil(rounds / 3)) {
    return {
      phase: "赛季初",
      authorityLabel: "赛季初参考",
      note: "赛季初只做参考，单轮广实差仍只读当轮权威表",
    };
  }
  return { phase: "维护期", authorityLabel: "当轮权威表" };
}

export function applyVenueDragon(num, dragon) {
  if (num == null) return null;
  return dragon ? Number(num) - 0.5 : Number(num);
}

export const IMAGE_ROLES = ["豪门", "传统强队", "中游", "保级"];

export function hardStrength(side = {}) {
  const hard = side.hard || {};
  const items = {
    squadValue: hard.squadValue ?? side.squadValue ?? null,
    finance: hard.finance ?? side.finance ?? null,
    wages: hard.wages ?? side.wages ?? null,
    recruit: hard.recruit ?? side.recruit ?? null,
    coach: hard.coach ?? side.coach ?? null,
    tactics: hard.tactics ?? side.tactics ?? null,
    facilities: hard.facilities ?? side.facilities ?? null,
  };
  const filled = Object.entries(items).filter(([, v]) => v != null && v !== "");
  if (!filled.length) {
    return { status: "未接入", role: "硬实力", note: "阵容身价、财力、引援、薪资、教练战术、设施都还没到", items };
  }
  return {
    status: "已接入",
    role: "硬实力",
    items,
    filled: filled.map(([k]) => k),
    note: "硬实力是客观底座：身价、财力、引援、薪资、战术稳定、设施",
  };
}

export function recentTrend(matches = [], { injuries, homeForm, awayForm, dragon, worm } = {}) {
  const rows = (matches || []).filter((m) => m?.gf != null && m?.ga != null);
  const pts = (slice) => slice.reduce((s, m) => s + (m.gf > m.ga ? 3 : m.gf === m.ga ? 1 : 0), 0);
  let trend = "未知";
  if (rows.length >= 3) {
    const last = rows.slice(0, 3);
    const lastPts = pts(last);
    const lastWins = last.filter((m) => m.gf > m.ga).length;
    const lastLosses = last.filter((m) => m.gf < m.ga).length;
    const prev = rows.slice(3, 6);
    const prevPts = prev.length ? pts(prev) : null;
    if (lastPts <= 1 && lastLosses >= 2) trend = "低迷";
    else if (prevPts != null && lastPts >= prevPts + 4 && lastWins >= 2) trend = "上升";
    else if (prevPts != null && lastPts + 3 <= prevPts) trend = "下落";
    else if (lastPts <= 2 && lastLosses >= 2) trend = "下落";
    else trend = "平稳";
  } else if (rows.length) {
    const p = pts(rows);
    trend = p >= rows.length * 2 ? "上升" : p <= 1 ? "低迷" : "平稳";
  }
  let venue = null;
  if (dragon === "home" || homeForm === "dragon") venue = "主场龙";
  else if (worm === "away" || awayForm === "worm") venue = "客场虫";
  else if (dragon === "away") venue = "客场龙";
  const injuryHit = Boolean(injuries?.abnormal || injuries?.hit || (injuries?.players || []).length);
  return {
    status: rows.length || venue || injuryHit ? "已接入" : "未接入",
    role: "近况",
    trend,
    venue,
    injuryHit,
    n: rows.length,
    note: [trend !== "未知" ? `近期${trend}` : null, venue, injuryHit ? "体能伤病有影响" : null].filter(Boolean).join(" · ") || "近况还没拆开",
  };
}

export function marketImage(side = {}, { lateSeason = false, rank, teams } = {}) {
  const raw = side.image || side.role || side.prestigeName || null;
  let role = IMAGE_ROLES.includes(raw) ? raw : null;
  const pedigree = side.pedigree ?? side.prestigePedigree ?? null;
  const prestigeNum = parseTierName(side.prestige ?? side.prestigeName);
  if (!role) {
    if (pedigree >= 0.6 || (prestigeNum != null && prestigeNum <= 3)) role = "豪门";
    else if (prestigeNum != null && prestigeNum <= 4.5) role = "传统强队";
    else if (lateSeason && rank != null && teams && rank >= teams - 2) role = "保级";
    else if (prestigeNum != null && prestigeNum >= 7.5) role = "中游";
    else if (side.tierNum != null && side.tierNum >= 7 && side.tierNum <= 8) role = "中游";
  }
  const heat = side.heat ?? side.media ?? side.popularity ?? null;
  return {
    status: role || pedigree != null || heat != null ? "已接入" : "未接入",
    role: role || "未定",
    pedigree,
    heat,
    note: role ? `市场形象按${role}看，这是长期地位，不是一场的排名` : "形象未接入",
  };
}

/**
 * 广实定位：硬实力（客观底座）+ 近况（动态）+ 形象（主观心理）。
 * 必须动态看。豪门状态差，口碑和投资热度不会掉太多，不轻易当爆冷。
 */
export function locateGuangshi(side = {}, ctx = {}) {
  const hard = hardStrength(side);
  const recent = recentTrend(side.recent || side.season || [], {
    injuries: ctx.injuries || side.injuries,
    homeForm: side.homeForm,
    awayForm: side.awayForm,
    dragon: side.dragon,
    worm: side.worm,
  });
  const image = marketImage(side, {
    lateSeason: ctx.lateSeason,
    rank: side.rank,
    teams: side.teams,
  });
  const slumpGiant = image.role === "豪门" && (recent.trend === "低迷" || recent.trend === "下落");
  return {
    definition: "广实定位是对一支球队在联赛或市场里综合实力地位的评估，要按基本面动态看",
    strategy: true,
    dynamic: true,
    hard,
    recent,
    image,
    coldUpset: slumpGiant ? false : null,
    note: slumpGiant
      ? "豪门状态不佳，口碑还在，市场热度不会掉太多，不轻易当爆冷"
      : "广实定位是分析策略，必须动态看",
  };
}

export function derbyRead({ homeImage, awayImage, derby = false } = {}) {
  const giants = ["豪门", "传统强队"];
  const strongStrong = giants.includes(homeImage) && giants.includes(awayImage);
  if (!derby && !strongStrong) return { kind: "常规", drawBias: false };
  return {
    kind: derby ? "德比" : "强强",
    drawBias: true,
    note: "强强对话或德比胜负难测，平局概率偏高",
  };
}

/**
 * |GD|≥3 顺分布；1–2 缓冲；0 中庸。半档算小优势，走缓冲。
 * GD 是静态实力差，不直接当赛果。
 */
export function distributionFromGd(gd) {
  if (gd == null || !Number.isFinite(Number(gd))) return null;
  const n = Number(gd);
  const abs = Math.abs(n);
  const stronger = n > 0 ? "home" : n < 0 ? "away" : null;
  if (abs === 0) return { kind: "中庸", abs, stronger, heat: "两边均衡" };
  if (abs >= 3) return { kind: "顺分布", abs, stronger, heat: "大众热捧强队" };
  return { kind: "缓冲", abs, stronger, heat: "热度分散" };
}

/**
 * 顺分布看强队赔率是否过低（诱强）；缓冲/中庸看赔率是否被压去诱买。
 * 赔率含抽水，无稳赢。
 */
export function verifyOddsDirection({
  gd,
  distribution,
  homeOdds,
  awayOdds,
  cheapHome = false,
  cheapAway = false,
} = {}) {
  if (!distribution) {
    return { kind: "未验", note: "缺广实差，不能验方向" };
  }
  const h = Number(homeOdds);
  const a = Number(awayOdds);
  const favOdds = distribution.stronger === "home" ? h : distribution.stronger === "away" ? a : null;
  if (distribution.kind === "顺分布" && favOdds != null && favOdds <= 1.45) {
    return {
      kind: "诱强",
      note: "顺分布里强队赔率过低，热捧强队，先怀疑诱强",
      favOdds,
    };
  }
  if ((distribution.kind === "缓冲" || distribution.kind === "中庸") && Number.isFinite(h) && Number.isFinite(a) && h + 0.15 < a) {
    return {
      kind: "诱买",
      note: cheapHome
        ? "近况有虐菜虚高，主胜被压低诱买"
        : "缓冲/中庸里主胜偏短，先看是不是诱买",
      homeOdds: h,
      awayOdds: a,
    };
  }
  if (cheapHome && distribution.kind === "缓冲") {
    return { kind: "虚高", note: "近况赢的是弱队，账面档偏高，按缓冲看不要按顺分布追" };
  }
  if (cheapAway && distribution.kind === "缓冲") {
    return { kind: "虚高", note: "客队近况含虐菜，不要把表面连胜当成顺分布" };
  }
  return {
    kind: "平衡",
    note: distribution.kind === "顺分布" ? "顺分布对照赔率，未见明显诱强" : "缓冲/中庸对照赔率，方向先看平衡",
  };
}

function normGd(gf, ga, played) {
  if (gf == null || ga == null || !played) return null;
  const per = (gf - ga) / played;
  return (Math.max(-2.2, Math.min(2.2, per)) + 2.2) / 4.4;
}

function normRank(rank, teams) {
  if (rank == null || !teams) return null;
  return (teams - rank) / Math.max(1, teams - 1);
}

function normForm(pts, max) {
  if (pts == null || !max) return null;
  return pts / max;
}

/**
 * 打分只用主客场进失球、排名、近五场。不看赔率。
 * 净胜 55%、排名 25%、近况 20%。缺进失和排名则未接入。
 */
export function scoreSide(side, { lastN = 5 } = {}) {
  const played = side.played || (side.gf != null && side.ga != null ? side.played : null) || side.played;
  const gd = normGd(side.gf, side.ga, side.played);
  const rank = normRank(side.rank, side.teams);
  const form = formPoints(side.recent, side.tierNum, { lastN, strip: true });
  const formN = normForm(form.pts, form.max);
  const hasGd = gd != null;
  const hasRank = rank != null;
  if (!hasGd && !hasRank) {
    return { status: "未接入", reason: "只有近况、没有进失球也没有排名，不打分", form };
  }
  let wGd = 0.55;
  let wRank = 0.25;
  let wForm = 0.2;
  if (!hasGd) {
    wRank += 0.55 / 2;
    wForm += 0.55 / 2;
    wGd = 0;
  }
  if (!hasRank) {
    wGd += 0.25 / 2;
    wForm += 0.25 / 2;
    wRank = 0;
  }
  if (formN == null) {
    const s = wGd + wRank;
    wGd = s ? wGd / s : 0;
    wRank = s ? wRank / s : 0;
    wForm = 0;
  }
  const score = (gd || 0) * wGd + (rank || 0) * wRank + (formN || 0) * wForm;
  return {
    status: "已接入",
    score,
    gd,
    rank,
    formN,
    form,
    weights: { gd: wGd, rank: wRank, form: wForm },
    inputs: {
      gf: side.gf,
      ga: side.ga,
      played: side.played,
      tableRank: side.rank,
      venue: side.venue,
    },
  };
}

export function scoresToMu(homeScore, awayScore) {
  const lh = 0.75 + 1.7 * homeScore;
  const la = 0.75 + 1.7 * awayScore;
  return { lambdaHome: lh, lambdaAway: la };
}

export function expectedAhFromProbs(grid) {
  const candidates = [-1.5, -1.25, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  let best = { line: 0, dist: 1 };
  for (const line of candidates) {
    const w = ahFair(grid, line).winRate;
    const dist = Math.abs(w - 0.5);
    if (dist < best.dist) best = { line, dist, winRate: w };
  }
  return best;
}

export function nearestFiftyAh(ahLines) {
  const rows = (ahLines || []).filter((r) => r.line != null && r.home != null && r.away != null && r.format);
  if (!rows.length) return null;
  let best = null;
  for (const r of rows) {
    const wr = impliedWinRate(r.home, r.away, r.format || FORMAT_HK);
    const dist = Math.abs(wr - 0.5);
    if (!best || dist < best.dist) best = { ...r, winRate: wr, dist };
  }
  return best;
}

export function pickHot(homeForm, awayForm, homeRank, awayRank) {
  if (homeForm != null && awayForm != null && homeForm !== awayForm) {
    return homeForm > awayForm ? "home" : "away";
  }
  if (homeRank != null && awayRank != null && homeRank !== awayRank) {
    return homeRank < awayRank ? "home" : "away";
  }
  return null;
}

export function leanOf(probs) {
  if (!probs) return null;
  const entries = [
    ["home", probs.home],
    ["draw", probs.draw],
    ["away", probs.away],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/**
 * 对照价格：体彩欧赔优先，否则平博欧赔。
 * 深浅只看平博最接近五五开的亚盘。体彩让球只展示。
 * 判 实力方向 / 资金 / 诱盘。不改盘口 μ。
 */
export function classifyVsPrice({
  gs1x2,
  expectedAh,
  jcEuro,
  pinEuro,
  pinAhFifty,
  jcHhad,
  hot,
  openRead,
  oddsCheck,
}) {
  const price = jcEuro || pinEuro || null;
  const priceSource = jcEuro ? "体彩欧赔" : pinEuro ? "平博欧赔" : "无欧赔";
  const gsLean = leanOf(gs1x2);
  const priceLean = leanOf(price);
  const depth = depthRead(expectedAh, pinAhFifty);
  let kind = "实力方向";
  let note = "广实偏向与价格偏向一致";
  if (oddsCheck?.kind === "诱强" || oddsCheck?.kind === "诱买") {
    kind = oddsCheck.kind;
    note = oddsCheck.note;
  } else if (openRead?.kind === "让浅" || (depth && depth.kind === "让浅")) {
    if (hot && gsLean && hot !== gsLean) {
      kind = "诱盘";
      note = "表面档/热度在一侧，让步偏浅，拉力在另一边";
    } else {
      kind = "诱盘";
      note = "开浅于档，热度压不住";
    }
  } else if (priceLean && gsLean && priceLean !== gsLean && hot && priceLean === hot) {
    kind = "资金";
    note = "价格跟着热门走，和广实实力方向不一致";
  } else if (priceLean && gsLean && priceLean !== gsLean) {
    kind = "利分布";
    note = "表面档高、价格拉力在另一边";
  }
  return {
    kind,
    note,
    gsLean,
    priceLean,
    priceSource,
    hot,
    depth,
    oddsCheck: oddsCheck || null,
    jcHhad: jcHhad || null,
    jcHhadNote: "体彩让球是玩法盘，只写不判深浅",
  };
}

export function depthRead(expectedAh, pinFifty) {
  if (expectedAh == null || pinFifty?.line == null) return { kind: "未对照", note: "缺平博五五开亚盘" };
  const exp = expectedAh;
  const act = Number(pinFifty.line);
  const gap = Math.abs(act) - Math.abs(exp);
  if (Math.abs(act - exp) <= 0.13) return { kind: "开在档上", expectedAh: exp, actualAh: act };
  if (Math.abs(act) + 0.12 < Math.abs(exp) && Math.sign(act || 1) === Math.sign(exp || 1)) {
    return { kind: "让浅", expectedAh: exp, actualAh: act, gap };
  }
  if (Math.abs(act) > Math.abs(exp) + 0.12) {
    return { kind: "让深", expectedAh: exp, actualAh: act, gap };
  }
  return { kind: "开在档上", expectedAh: exp, actualAh: act };
}

export function openVsInterval(expected, williamDec, imageBoost = 0) {
  if (!expected) return { kind: "未对照" };
  const w = williamInterval(williamDec);
  if (!w) return { kind: "未对照", expected };
  const adj = expected.n;
  if (w.n === adj) return { kind: "开在档上", william: w, expected };
  if (w.n > adj) {
    const note = imageBoost
      ? `读成${w.name}，档上应是${expected.name}，最多形象加 ${imageBoost} 档仍偏低开`
      : `读成${w.name}，档上应是${expected.name}`;
    return { kind: "低开", william: w, expected, note };
  }
  if (w.n < adj) return { kind: "高开", william: w, expected };
  return { kind: "开在档上", william: w, expected };
}

export function inventoryOf(match) {
  return {
    fiveYearRanks: Boolean(match.tierBuild?.fiveYearRanks?.length),
    titleOdds: Boolean(match.tierBuild?.titleOdds?.length),
    openings: Boolean(match.tierBuild?.openings?.length),
    commonOpponents: Boolean(match.tierBuild?.homeResults && match.tierBuild?.awayResults),
    homeGd: match.fundamentals?.home?.gf != null,
    awayGd: match.fundamentals?.away?.ga != null || match.fundamentals?.away?.gf != null,
    ranks: match.fundamentals?.home?.rank != null && match.fundamentals?.away?.rank != null,
    form: Boolean(match.fundamentals?.home?.recent?.length || match.fundamentals?.away?.recent?.length),
    jcEuro: Boolean(match.jc?.had?.home),
    pinEuro: Boolean(match.pinnacle?.euro?.home),
    pinAh: Boolean(match.pinnacle?.ah?.length),
    prestige: match.guangshiPreset?.home?.prestige != null,
  };
}

export function analyzeGuangshi(match, books, { rho = -0.08 } = {}) {
  const league = classify(match.leagueAbbName);
  const span = leagueTierSpan(league.class, league.catalog?.code);
  const inv = inventoryOf(match);
  const preset = match.guangshiPreset || {};

  const ladder = buildLadder({
    titleOdds: match.tierBuild?.titleOdds,
    fiveYearRanks: match.tierBuild?.fiveYearRanks,
    openings: match.tierBuild?.openings || [],
    span,
  });
  const locked = ladder.locked;
  let homeNum = parseTierName(preset.home?.num ?? preset.home?.name);
  let awayNum = parseTierName(preset.away?.num ?? preset.away?.name);
  const inferred = [...ladder.inferred];

  const homeFromLadder = match.home && ladder.tiers[match.home];
  const awayFromLadder = match.away && ladder.tiers[match.away];
  if (homeNum == null && homeFromLadder) {
    homeNum = homeFromLadder.num;
    inferred.push({ side: "home", ...homeFromLadder });
  }
  if (awayNum == null && awayFromLadder) {
    awayNum = awayFromLadder.num;
    inferred.push({ side: "away", ...awayFromLadder });
  }

  if (homeNum == null && match.tierBuild?.homeOpening && match.tierBuild?.oppNum != null) {
    const inf = inferFromOpening({
      selfIsHome: true,
      openingAh: match.tierBuild.homeOpening,
      knownOppNum: match.tierBuild.oppNum,
      span,
    });
    if (inf) {
      homeNum = inf.num;
      inferred.push({ side: "home", ...inf });
    }
  }
  if (awayNum == null && match.tierBuild?.awayOpening && match.tierBuild?.oppNum != null) {
    const inf = inferFromOpening({
      selfIsHome: false,
      openingAh: match.tierBuild.awayOpening,
      knownOppNum: match.tierBuild.oppNum,
      span,
    });
    if (inf) {
      awayNum = inf.num;
      inferred.push({ side: "away", ...inf });
    }
  }

  if (match.tierBuild?.homeResults && match.tierBuild?.awayResults && homeNum != null && awayNum != null) {
    const pn = panNeng(
      { results: match.tierBuild.homeResults },
      { results: match.tierBuild.awayResults },
    );
    if (pn.ok && pn.delta) {
      homeNum = clampTier(homeNum + (pn.delta < 0 ? -0.5 : 0), span);
      awayNum = clampTier(awayNum + (pn.delta > 0 ? -0.5 : 0), span);
      inferred.push({ side: "both", source: "盘能", ...pn });
    }
  }

  if (preset.home?.prestige != null && homeNum != null) {
    homeNum = applyPedigree(homeNum, parseTierName(preset.home.prestige), preset.home.pedigree ?? 0);
  }
  if (preset.away?.prestige != null && awayNum != null) {
    awayNum = applyPedigree(awayNum, parseTierName(preset.away.prestige), preset.away.pedigree ?? 0);
  }

  const revisions = [];
  if (preset.home?.prevNum != null) {
    const rev = reviseAuthority({
      prevNum: preset.home.prevNum,
      proposedNum: homeNum,
      consecutiveSameDirection: preset.home.consecutive === true,
      squadChanged: preset.home.squadChanged === true,
      opponentGifted: preset.home.opponentGifted === true,
      lastRoundBiased: preset.home.lastRoundBiased === true,
    });
    homeNum = rev.num;
    revisions.push({ side: "home", ...rev });
  }
  if (preset.away?.prevNum != null) {
    const rev = reviseAuthority({
      prevNum: preset.away.prevNum,
      proposedNum: awayNum,
      consecutiveSameDirection: preset.away.consecutive === true,
      squadChanged: preset.away.squadChanged === true,
      opponentGifted: preset.away.opponentGifted === true,
      lastRoundBiased: preset.away.lastRoundBiased === true,
    });
    awayNum = rev.num;
    revisions.push({ side: "away", ...rev });
  }

  const fund = match.fundamentals || {};
  const homeQuality = opponentQuality(fund.home?.recent || fund.home?.season || [], homeNum);
  const awayQuality = opponentQuality(fund.away?.recent || fund.away?.season || [], awayNum);
  const homeMath = mathGuangshi({ ...fund.home, tierNum: homeNum });
  const awayMath = mathGuangshi({ ...fund.away, tierNum: awayNum });
  const homeCheck = mathCannotOverride(homeNum, homeMath.num);
  const awayCheck = mathCannotOverride(awayNum, awayMath.num);
  const played = fund.home?.played ?? fund.away?.played ?? match.standing?.home?.played;
  const phase = seasonPhase(played, league.catalog?.rounds);
  const homeRankNote = rankSituation(fund.home?.rank ?? match.standing?.home?.rank, fund.home?.teams || league.catalog?.teams, homeNum);
  const awayRankNote = rankSituation(fund.away?.rank ?? match.standing?.away?.rank, fund.away?.teams || league.catalog?.teams, awayNum);

  const tableHome = homeNum;
  const tableAway = awayNum;
  const homeDragon = preset.home?.dragon === "home" || match.venueDragon?.home === true;
  const awayDragon = preset.away?.dragon === "away" || match.venueDragon?.away === true;
  homeNum = applyVenueDragon(homeNum, homeDragon);
  awayNum = applyVenueDragon(awayNum, awayDragon);

  const diff = guangshiDiff(homeNum, awayNum);
  const mathDiff = guangshiDiff(homeMath.num, awayMath.num);
  const diffText = describeDiff(diff);
  const expected = intervalFromDiff(diff);
  const distribution = distributionFromGd(diff);
  const oddsCheck = verifyOddsDirection({
    gd: diff,
    distribution,
    homeOdds: match.jc?.had?.home,
    awayOdds: match.jc?.had?.away,
    cheapHome: homeQuality.cheapWins > 0,
    cheapAway: awayQuality.cheapWins > 0,
  });
  const rulers = {
    authority: {
      home: homeNum,
      away: awayNum,
      tableHome,
      tableAway,
      diff,
      label: phase.authorityLabel,
      note: "单轮广实差只读当轮权威表",
      venueDragon: { home: homeDragon, away: awayDragon },
    },
    distribution,
    oddsCheck,
    math: {
      home: homeMath.num ?? null,
      away: awayMath.num ?? null,
      diff: mathDiff,
      homeSide: homeMath,
      awaySide: awayMath,
      label: "数学广实",
      note: "只校准，不能越过权威替它做决定",
    },
    drift: {
      home: homeCheck,
      away: awayCheck,
      halfTier: Boolean(homeCheck.halfTier || awayCheck.halfTier || (diff != null && mathDiff != null && Math.abs(diff - mathDiff) >= 0.5)),
    },
    quality: { home: homeQuality, away: awayQuality },
    rank: { home: homeRankNote, away: awayRankNote },
    phase,
    revisions,
  };

  const homeScore = scoreSide({ ...fund.home, tierNum: homeNum, venue: "home", teams: fund.home?.teams || league.catalog?.teams });
  const awayScore = scoreSide({ ...fund.away, tierNum: awayNum, venue: "away", teams: fund.away?.teams || league.catalog?.teams });

  let gs1x2 = null;
  let gsAh = null;
  let gsMu = null;
  if (homeScore.status === "已接入" && awayScore.status === "已接入") {
    gsMu = scoresToMu(homeScore.score, awayScore.score);
    const { grid } = gridOf(gsMu.lambdaHome, gsMu.lambdaAway, rho, 10);
    gs1x2 = oneXTwo(grid);
    gsAh = expectedAhFromProbs(grid);
  }

  const pinFifty = nearestFiftyAh(books?.ah || match.pinnacle?.ah || []);
  const jcEuro = match.jc?.had
    ? { home: 1 / match.jc.had.home, draw: 1 / match.jc.had.draw, away: 1 / match.jc.had.away }
    : null;
  let jcEuroDevig = null;
  if (match.jc?.had?.home) {
    const h = 1 / match.jc.had.home;
    const d = 1 / match.jc.had.draw;
    const a = 1 / match.jc.had.away;
    const s = h + d + a;
    jcEuroDevig = { home: h / s, draw: d / s, away: a / s };
  }
  const pinEuro = books?.euro
    ? { home: books.euro.home, draw: books.euro.draw, away: books.euro.away }
    : null;

  const hot = pickHot(
    homeScore.formN,
    awayScore.formN,
    fund.home?.rank,
    fund.away?.rank,
  );

  const william = match.opening?.william ?? match.opening?.homeDec;
  const imageBoost = match.opening?.imageBoost || 0;
  const openRead = openVsInterval(expected, william, imageBoost);
  const vs = classifyVsPrice({
    gs1x2,
    expectedAh: expected?.expectedAh,
    jcEuro: jcEuroDevig,
    pinEuro,
    pinAhFifty: pinFifty,
    jcHhad: match.jc?.hhad || null,
    hot,
    openRead,
    oddsCheck,
  });

  const lateSeason = Boolean(league.catalog?.rounds && played != null && played >= Math.ceil(league.catalog.rounds * 0.75));
  const homeLocate = locateGuangshi({
    ...fund.home,
    ...preset.home,
    recent: fund.home?.recent || fund.home?.season,
    tierNum: tableHome ?? homeNum,
    rank: fund.home?.rank ?? match.standing?.home?.rank,
    teams: fund.home?.teams || league.catalog?.teams,
  }, { injuries: match.injuries, lateSeason });
  const awayLocate = locateGuangshi({
    ...fund.away,
    ...preset.away,
    recent: fund.away?.recent || fund.away?.season,
    tierNum: tableAway ?? awayNum,
    rank: fund.away?.rank ?? match.standing?.away?.rank,
    teams: fund.away?.teams || league.catalog?.teams,
  }, { injuries: match.injuries, lateSeason });
  const derby = derbyRead({
    homeImage: homeLocate.image.role,
    awayImage: awayLocate.image.role,
    derby: match.derby === true || preset.derby === true,
  });

  const status = homeNum == null && awayNum == null && homeScore.status === "未接入"
    ? "未接入"
    : "已计算";

  return {
    status,
    span,
    locked,
    ladder,
    inferred,
    home: { num: homeNum, name: nameOf(homeNum), score: homeScore, ruler: "authority", locate: homeLocate },
    away: { num: awayNum, name: nameOf(awayNum), score: awayScore, ruler: "authority", locate: awayLocate },
    diff,
    diffText: diffText.text,
    homeStrongerBy: diffText.homeStrongerBy,
    expected,
    openRead,
    vs,
    gs1x2,
    gsAh,
    gsMu,
    pinFifty,
    hot,
    inventory: inv,
    rulers,
    distribution,
    oddsCheck,
    locate: { home: homeLocate, away: awayLocate, derby },
    motto: "符号定强弱，绝对值看差距，分布定热度，赔率验方向",
    note: "广实定位是动态策略；GD=客档−主档只读权威表；数学广实只校准；赔率含抽水无稳赢；不改盘口 μ",
  };
}
