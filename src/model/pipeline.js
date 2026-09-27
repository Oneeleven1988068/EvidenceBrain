import { bookMu, residualCheck, rhoPrior } from "../calc/bookMu.js";
import { impliedWinRate, devig1x2, FORMAT_HK, FORMAT_DEC, toDecimal } from "../calc/odds.js";
import { gridOf, oneXTwo } from "../calc/dixonColes.js";
import { ahFair, ouFair } from "../calc/settle.js";
import { closeAt, jcSnap } from "../calc/closeAt.js";
import { classify, leagueMotive, applyMotivePair } from "../league/catalog.js";
import { grossOf, injuryStatus } from "./injury.js";
import { perSideLineup, rotationRisk } from "./lineup.js";
import {
  cellsFromProbs,
  handicapIdentity,
  rhoSensitivity,
  verdictOf,
  zName,
} from "./verdict.js";
import { analyzeGuangshi } from "./guangshi.js";

export function pinnacleLinesFromBooks(books) {
  const ah = [];
  const ou = [];
  let euro = null;
  for (const b of books.ah || []) {
    if (b.book_id !== 47) continue;
    if (!b.odds_format) throw new Error("odds format required");
    ah.push({
      line: Number(b.line),
      winRate: impliedWinRate(b.home, b.away, b.odds_format),
      home: b.home,
      away: b.away,
      format: b.odds_format,
      changed_at: b.changed_at,
      fetched_at: b.fetched_at,
      book_id: 47,
    });
  }
  for (const b of books.ou || []) {
    if (b.book_id !== 47) continue;
    if (!b.odds_format) throw new Error("odds format required");
    if (b.over == null || b.under == null) continue;
    ou.push({
      line: Number(b.line),
      winRate: impliedWinRate(b.over, b.under, b.odds_format),
      over: b.over,
      under: b.under,
      format: b.odds_format,
      changed_at: b.changed_at,
      fetched_at: b.fetched_at,
      book_id: 47,
      side: "over",
    });
  }
  if (books.euro) {
    const e = books.euro;
    if (e.book_id !== 177) {
      /* still accept if explicitly pinnacle euro */
    }
    if (!e.odds_format) throw new Error("odds format required");
    euro = {
      book_id: 177,
      odds_format: e.odds_format || FORMAT_DEC,
      ...devig1x2(e.home, e.draw, e.away, e.odds_format || FORMAT_DEC),
      raw: { home: e.home, draw: e.draw, away: e.away },
      changed_at: e.changed_at,
      fetched_at: e.fetched_at,
    };
  }
  return { ah, ou, euro };
}

export function valueCell(modelP, jcOdds, format, poolStatus, snapshotAt) {
  if (jcOdds == null) return { ev: null, pool: poolStatus || "缺失" };
  const dec = toDecimal(jcOdds, format || FORMAT_DEC);
  return {
    ev: modelP * dec - 1,
    dec,
    pool: poolStatus || "未知",
    snapshot_at: snapshotAt,
  };
}

export function analyzeMatch(match, now = new Date()) {
  const league = classify(match.leagueAbbName);
  const rhoInfo = rhoPrior(match.rho ?? league.rho);
  const close = closeAt({ businessDate: match.businessDate, kickoffAt: match.kickoffAt });
  const jc = jcSnap({
    now,
    businessDate: match.businessDate,
    close_at: close.close_at,
    snapshot_at: match.jc?.snapshot_at,
    imported: match.jc?.imported,
    jc_points: match.jc?.jc_points,
  });

  let books;
  try {
    books = pinnacleLinesFromBooks(match.pinnacle || {});
  } catch (err) {
    books = { ah: [], ou: [], euro: null, error: err.message };
  }

  const pinTimes = [
    ...books.ah.map((x) => x.changed_at),
    ...books.ou.map((x) => x.changed_at),
    books.euro?.changed_at,
  ].filter(Boolean);
  const pinChangedAt = pinTimes.sort().at(-1) || null;
  const pinFetchedAt = [
    ...books.ah.map((x) => x.fetched_at),
    ...books.ou.map((x) => x.fetched_at),
    books.euro?.fetched_at,
  ]
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  const euroOwnTime = books.euro?.changed_at || null;
  const ahMainTime = books.ah[0]?.changed_at || null;
  const euroCopiedFromAh = euroOwnTime && ahMainTime && euroOwnTime === ahMainTime && !match.pinnacle?.euro?.ownClock;

  const goalsAssumed = books.ou.length === 0;
  const fit = goalsAssumed
    ? { ok: false, reason: "缺大小球" }
    : bookMu({ ah: books.ah, ou: books.ou }, rhoInfo.rho);

  const fitCheck = fit.ok && books.euro
    ? residualCheck(fit, books.euro)
    : residualCheck(fit, null);

  const { grid } = fit.ok
    ? { grid: fit.grid }
    : gridOf(match.seedMu?.home || 1.2, match.seedMu?.away || 1.1, rhoInfo.rho);

  const model1x2 = oneXTwo(grid);
  const market1x2 = books.euro
    ? { home: books.euro.home, draw: books.euro.draw, away: books.euro.away }
    : match.jc?.had
      ? devig1x2(match.jc.had.home, match.jc.had.draw, match.jc.had.away, FORMAT_DEC)
      : model1x2;

  const injHome = grossOf(match.injuries?.players, "home");
  const injAway = grossOf(match.injuries?.players, "away");
  const injuryAbnormal = injHome.abnormal || injAway.abnormal;
  const injState = injuryStatus(match.injuries || {});
  const lineup = perSideLineup(match.lineup?.home, match.lineup?.away);

  const motiveHome = leagueMotive("home", match.standing?.home, match.leagueAbbName);
  const motiveAway = leagueMotive("away", match.standing?.away, match.leagueAbbName);
  const motivePair = applyMotivePair(motiveHome, motiveAway);

  let lambdaHome = fit.ok ? fit.lambdaHome : null;
  let lambdaAway = fit.ok ? fit.lambdaAway : null;
  if (lambdaHome && injState.entered && lineup.residualOk) {
    lambdaHome *= injHome.mul * motivePair.lambdaMulHome;
    lambdaAway *= injAway.mul * motivePair.lambdaMulAway;
  }
  const adjGrid = lambdaHome
    ? gridOf(lambdaHome, lambdaAway, rhoInfo.rho).grid
    : grid;
  const modelAdj = oneXTwo(adjGrid);

  const hhadLine = match.jc?.hhad_line ?? match.hhad_line;
  const identity = fit.ok && hhadLine != null && match.jc?.hhad
    ? handicapIdentity(fit.grid, market1x2, match.jc.hhad, hhadLine)
    : { flags: [], note: hhadLine == null ? "让球数缺失、不结算" : "缺让球盘口" };

  const cellsHad = cellsFromProbs(modelAdj, market1x2);
  const lo = gridOf(lambdaHome || 1.2, lambdaAway || 1.1, -0.18);
  const hi = gridOf(lambdaHome || 1.2, lambdaAway || 1.1, -0.03);
  const rhoSense = rhoSensitivity(cellsHad, cellsFromProbs(oneXTwo(lo.grid), market1x2), cellsFromProbs(oneXTwo(hi.grid), market1x2));

  const jcSnapAt = match.jc?.snapshot_at;
  const lagMs = pinChangedAt && jcSnapAt ? Math.abs(new Date(pinChangedAt) - new Date(jcSnapAt)) : null;
  const columnLagMinutes = lagMs != null ? lagMs / 60000 : null;

  const valueCells = match.jc?.had
    ? [
        { key: "home", ...valueCell(modelAdj.home, match.jc.had.home, FORMAT_DEC, match.jc.had.singleHome, jcSnapAt) },
        { key: "draw", ...valueCell(modelAdj.draw, match.jc.had.draw, FORMAT_DEC, match.jc.had.singleDraw, jcSnapAt) },
        { key: "away", ...valueCell(modelAdj.away, match.jc.had.away, FORMAT_DEC, match.jc.had.singleAway, jcSnapAt) },
      ]
    : [];

  const rotation = rotationRisk(
    match.schedule?.home?.prevDays,
    match.schedule?.home?.nextDays,
    match.schedule?.home?.nextMoreImportant,
    "主队",
  );

  const verdict = verdictOf({
    injury: injState,
    lineup: { status: lineup.residualOk ? "已接入" : "缺失", entered: lineup.residualOk },
    motive: motiveHome.status === "缺失" || motiveAway.status === "缺失"
      ? { status: "缺失" }
      : motiveHome.status === "不适用" && motiveAway.status === "不适用"
        ? { status: "不适用" }
        : { status: "已接入" },
    form: { status: "不适用" },
    clean: { status: "不适用" },
    table: match.standing ? { status: "已接入" } : { status: league.class === "league" ? "缺失" : "不适用" },
    rotation: league.class === "league"
      ? (rotation.status === "赛程未接入" ? { status: "缺失" } : { status: "已接入" })
      : { status: "不适用" },
    flags: [
      ...(injuryAbnormal ? ["伤停扣减异常"] : []),
      ...(goalsAssumed ? ["总进球为假设值"] : []),
      ...(euroCopiedFromAh ? ["平博欧赔时间疑似从亚盘抄来"] : []),
    ],
    identity,
    fitCheck,
    injuryAbnormal,
    goalsAssumed,
    columnLagMinutes,
    cells: cellsHad,
    rhoSense,
    ahCount: books.ah.length,
    ouCount: books.ou.length,
    valueCells,
    week1: match.week1 === true,
    jcStatus: jc.status,
  });

  const pathLabel = new Date(now) < new Date(close.close_at || 0) ? "未到封盘时点" : verdict.title;

  const bookMuBefore = { lambdaHome: fit.ok ? fit.lambdaHome : null, lambdaAway: fit.ok ? fit.lambdaAway : null };
  const guangshi = analyzeGuangshi(match, books, { rho: rhoInfo.rho });
  const bookMuAfter = { lambdaHome: fit.ok ? fit.lambdaHome : null, lambdaAway: fit.ok ? fit.lambdaAway : null };

  return {
    id: match.id,
    jcId: match.jcId,
    home: match.home,
    away: match.away,
    league,
    rhoInfo,
    close,
    jc,
    books,
    pinChangedAt,
    pinFetchedAt,
    euroOwnTime,
    fit,
    fitCheck,
    model1x2,
    modelAdj,
    market1x2,
    lambdaHome,
    lambdaAway,
    injHome,
    injAway,
    injState,
    lineup,
    motiveHome,
    motiveAway,
    motivePair,
    identity,
    cellsHad,
    rhoSense,
    valueCells,
    rotation,
    verdict,
    pathLabel,
    hhadName: zName(hhadLine),
    columnLagMinutes,
    computedAt: new Date(now).toISOString(),
    nameMap: match.nameMap || { ok: match.injuries?.name_map_ok === true },
    guangshi,
    bookMuUnchanged: bookMuBefore.lambdaHome === bookMuAfter.lambdaHome
      && bookMuBefore.lambdaAway === bookMuAfter.lambdaAway,
  };
}

export function ouQuote(row) {
  if (row.line == null || row.over == null || row.under == null) {
    return { ok: false, reason: "缺大小球" };
  }
  return { ok: true, line: row.line, over: row.over, under: row.under };
}

export { FORMAT_HK, FORMAT_DEC, ahFair, ouFair };
