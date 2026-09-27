/**
 * 体彩 leagueAbbName 对照表. Items 4, 24, 35–39.
 * Missing a required field → motive is 不适用, never the generic 20-team rule.
 */

export const LEAGUE_CATALOG = {
  英超: {
    class: "league",
    code: "EPL",
    tierSpan: "top",
    teams: 20,
    rounds: 38,
    promo: null,
    playoff: null,
    releg: 18,
    title: 1,
    ucl: 4,
    rhoHint: -0.08,
  },
  英冠: {
    class: "league",
    code: "ELC",
    teams: 24,
    rounds: 46,
    promo: 2,
    playoff: 6,
    releg: 22,
    title: 1,
    rhoHint: -0.08,
  },
  日乙: {
    class: "league",
    aliases: ["日职乙", "J2", "J二", "JLeague2"],
    code: "J2",
    teams: 20,
    rounds: 38,
    promo: 2,
    playoff: 6,
    releg: 18,
    title: 1,
    rhoHint: -0.10,
  },
  日职: {
    class: "league",
    aliases: ["日职联", "J1"],
    code: "J1",
    teams: 20,
    rounds: 38,
    promo: null,
    playoff: null,
    releg: 18,
    title: 1,
    rhoHint: -0.10,
  },
  韩职: {
    class: "league",
    aliases: ["K联赛", "K League"],
    code: "K1",
    teams: 12,
    rounds: 38,
    splitAfter: 33,
    promo: null,
    playoff: 10,
    releg: 12,
    title: 1,
    acl: 3,
    rhoHint: -0.08,
  },
  荷乙: {
    class: "league",
    aliases: ["荷乙联", "Eerste"],
    code: "EER",
    teams: 20,
    rounds: 38,
    promo: 2,
    playoff: 8,
    releg: null,
    title: 1,
    rhoHint: -0.06,
  },
  美职: {
    class: "league",
    aliases: ["美职联", "MLS"],
    code: "MLS",
    teams: 30,
    rounds: 34,
    promo: null,
    playoff: null,
    releg: null,
    conferencePlayoff: 9,
    title: null,
    rhoHint: -0.05,
    motive: "mls",
  },
  西甲: { class: "league", code: "ESP", teams: 20, rounds: 38, promo: null, playoff: null, releg: 18, title: 1, rhoHint: -0.08 },
  德甲: { class: "league", code: "GER", teams: 18, rounds: 34, promo: null, playoff: 16, releg: 17, title: 1, rhoHint: -0.09 },
  意甲: { class: "league", code: "ITA", teams: 20, rounds: 38, promo: null, playoff: null, releg: 18, title: 1, rhoHint: -0.08 },
  法甲: { class: "league", code: "FRA", teams: 18, rounds: 34, promo: null, playoff: 16, releg: 17, title: 1, rhoHint: -0.08 },
  欧国联: { class: "ntl", code: "UNL", motive: "none", rhoHint: -0.08 },
  亚运男足: { class: "youth", code: "ASIAD", motive: "none", rhoHint: -0.08 },
  国际赛: { class: "ntl", code: "INT", motive: "none", rhoHint: -0.08 },
  欧冠: { class: "cup", code: "UCL", motive: "none", rhoHint: -0.06 },
  足总杯: { class: "cup", code: "FAC", motive: "none", rhoHint: -0.06 },
};

const ALIAS = {};
for (const [name, meta] of Object.entries(LEAGUE_CATALOG)) {
  ALIAS[name] = name;
  for (const a of meta.aliases || []) ALIAS[a] = name;
}

export function classify(leagueAbbName) {
  const key = ALIAS[leagueAbbName] || ALIAS[String(leagueAbbName || "").trim()];
  if (!key) {
    return {
      name: leagueAbbName,
      class: "unknown",
      rho: -0.08,
      rhoLabel: "分类缺失，ρ 用默认值",
      motive: "none",
      catalog: null,
    };
  }
  const meta = LEAGUE_CATALOG[key];
  return {
    name: key,
    class: meta.class,
    rho: meta.rhoHint ?? -0.08,
    rhoLabel: "临时先验",
    motive: meta.motive || (meta.class === "league" ? "table" : "none"),
    catalog: meta,
  };
}

export function leagueOk(leagueAbbName) {
  const c = classify(leagueAbbName);
  return c.class === "league";
}

export function oneThirdPlayed(meta, played) {
  if (!meta?.rounds) return false;
  return played >= Math.ceil(meta.rounds / 3);
}

/**
 * Item 12, 37, 38. Returns per-side motive. Cup / unknown → 不适用.
 * MLS uses conference rank and pts off 9th. No-relegation leagues never say 降级压力.
 */
export function leagueMotive(side, standing, leagueAbbName) {
  const c = classify(leagueAbbName);
  if (c.motive === "none" || c.class !== "league") {
    return { status: "不适用", label: c.class === "unknown" ? "分类缺失" : "不套战意", mul: 1, reason: [] };
  }
  if (!standing) return { status: "缺失", label: "积分榜未接入", mul: 1, reason: [] };
  const meta = c.catalog;
  const required = ["played"];
  if (c.motive === "mls") required.push("conference_rank", "pts_off_playoff");
  else required.push("rank");
  const missing = required.filter((k) => standing[k] == null);
  if (missing.length) return { status: "缺失", label: `缺 ${missing.join(",")}`, mul: 1, reason: missing };
  if (meta.teams == null || meta.rounds == null) {
    return { status: "不适用", label: "对照表缺队数或总轮数", mul: 1, reason: [] };
  }
  if (c.motive !== "mls" && (meta.promo == null && meta.releg == null && meta.playoff == null && meta.title == null)) {
    return { status: "不适用", label: "对照表缺升降级线", mul: 1, reason: [] };
  }
  if (!oneThirdPlayed(meta, standing.played)) {
    return {
      status: "已接入",
      label: "赛季未过三分之一，战意中性",
      mul: 1,
      reason: [`已赛 ${standing.played}/${meta.rounds}`],
    };
  }

  if (c.motive === "mls") {
    const off = standing.pts_off_playoff;
    const rank = standing.conference_rank;
    const reasons = [`分区第 ${rank}`, `离第 9 名 ${off} 分`, `已赛 ${standing.played}`];
    if (rank <= 4 && off <= -6) return { status: "已接入", label: "季后赛稳", mul: 0.96, side, reason: reasons };
    if (rank <= 9 && Math.abs(off) <= 6) return { status: "已接入", label: "外卡争夺", mul: 1.08, side, reason: reasons };
    if (rank > 9 && off <= 8) return { status: "已接入", label: "追季后赛", mul: 1.06, side, reason: reasons };
    if (rank > 9 && off > 8) return { status: "已接入", label: "季后赛无望", mul: 0.94, side, reason: reasons };
    return { status: "已接入", label: "中游", mul: 1, side, reason: reasons };
  }

  const rank = standing.rank;
  const reasons = [
    `第 ${rank}/${meta.teams}`,
    `已赛 ${standing.played}`,
    standing.gap_promo != null ? `离升级 ${standing.gap_promo}` : null,
    standing.gap_rel != null ? `离降级 ${standing.gap_rel}` : null,
    standing.gap_title != null ? `离争冠 ${standing.gap_title}` : null,
    standing.gap_acl != null ? `离亚冠 ${standing.gap_acl}` : null,
  ].filter(Boolean);

  if (meta.releg != null && rank >= meta.releg) {
    return { status: "已接入", label: "降级压力", mul: 1.1, side, reason: reasons };
  }
  if (meta.releg == null && rank >= (meta.teams || 20) - 2) {
    return { status: "已接入", label: "无降级，中下游", mul: 1, side, reason: reasons };
  }
  if (meta.title != null && rank <= meta.title) {
    return { status: "已接入", label: "争冠", mul: 1.08, side, reason: reasons };
  }
  if (meta.promo != null && rank <= meta.promo) {
    return { status: "已接入", label: "升级区", mul: 1.08, side, reason: reasons };
  }
  if (meta.playoff != null && rank <= meta.playoff) {
    return { status: "已接入", label: "附加赛区", mul: 1.05, side, reason: reasons };
  }
  return { status: "已接入", label: "中游", mul: 1, side, reason: reasons };
}

export function applyMotivePair(home, away) {
  const bothIndependent =
    home.status === "已接入" &&
    away.status === "已接入" &&
    home.mul !== 1 &&
    away.mul !== 1 &&
    home.side &&
    away.side &&
    home.side !== away.side;
  if (bothIndependent) {
    return { lambdaMulHome: home.mul, lambdaMulAway: away.mul, note: "两侧各有独立证据" };
  }
  if (home.status === "已接入" && home.mul !== 1 && !(away.status === "已接入" && away.mul !== 1)) {
    return { lambdaMulHome: home.mul, lambdaMulAway: 1, note: "只调主队" };
  }
  if (away.status === "已接入" && away.mul !== 1 && !(home.status === "已接入" && home.mul !== 1)) {
    return { lambdaMulHome: 1, lambdaMulAway: away.mul, note: "只调客队" };
  }
  if (home.mul !== 1 && away.mul !== 1) {
    const pickHome = Math.abs(home.mul - 1) >= Math.abs(away.mul - 1);
    return pickHome
      ? { lambdaMulHome: home.mul, lambdaMulAway: 1, note: "两侧同向，只留证据更强的一边" }
      : { lambdaMulHome: 1, lambdaMulAway: away.mul, note: "两侧同向，只留证据更强的一边" };
  }
  return { lambdaMulHome: 1, lambdaMulAway: 1, note: "中性" };
}
