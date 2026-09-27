/**
 * 广实推论。档不是现成库，先钉中游，再用开盘和盘能反推。
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
  const homeStrongerBy = -capped;
  const actualBy = -diff;
  const gapLabel = actualBy === 0 ? "同档" : actualBy > 0 ? `主高${actualBy}档` : `客高${-actualBy}档`;
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
}) {
  const price = jcEuro || pinEuro || null;
  const priceSource = jcEuro ? "体彩欧赔" : pinEuro ? "平博欧赔" : "无欧赔";
  const gsLean = leanOf(gs1x2);
  const priceLean = leanOf(price);
  const depth = depthRead(expectedAh, pinAhFifty);
  let kind = "实力方向";
  let note = "广实偏向与价格偏向一致";
  if (openRead?.kind === "让浅" || (depth && depth.kind === "让浅")) {
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

  const diff = guangshiDiff(homeNum, awayNum);
  const diffText = describeDiff(diff);
  const expected = intervalFromDiff(diff);

  const fund = match.fundamentals || {};
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
    home: { num: homeNum, name: nameOf(homeNum), score: homeScore },
    away: { num: awayNum, name: nameOf(awayNum), score: awayScore },
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
    note: "广实不改盘口 μ，进球 μ 不被这栏改写",
  };
}
