/**
 * 广实九档。数字越小越强。相邻名字之间可以落半档。
 * 顶级联赛用满九档，必要时拉到 10、11；二级联赛只用中间四到六档。
 */

export const TIER_NAMES = [
  "超强",
  "人强",
  "普强",
  "准强",
  "中强",
  "中上",
  "中游",
  "中下",
  "下游",
];

export const MIDTABLE = 7;

export function leagueTierSpan(leagueClass, code) {
  const top = new Set(["EPL", "ESP", "GER", "ITA", "FRA", "UCL"]);
  if (top.has(code) || leagueClass === "top") {
    return { min: 1, max: 11, used: [1, 2, 3, 4, 5, 6, 7, 8, 9], stretch: true };
  }
  return { min: 4, max: 9, used: [5, 6, 7, 8], stretch: false };
}

export function clampTier(n, span) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return Math.max(span.min, Math.min(span.max, Number(n)));
}

export function nameOf(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  const x = Number(n);
  if (x >= 10) return `下游+${x - 9}`;
  const lo = Math.floor(x);
  const hi = Math.ceil(x);
  if (lo === hi) return TIER_NAMES[lo - 1] || `第${x}档`;
  const a = TIER_NAMES[lo - 1];
  const b = TIER_NAMES[hi - 1];
  return a && b ? `${a}/${b}` : `第${x}档`;
}

export function parseTierName(name, leagueCode) {
  if (name == null) return null;
  if (typeof name === "number") return name;
  const raw = String(name).trim();
  if ((leagueCode === "J1" || leagueCode === "J2") && J_LEAGUE_TIER[raw] != null) {
    return J_LEAGUE_TIER[raw];
  }
  const i = TIER_NAMES.indexOf(raw);
  if (i >= 0) return i + 1;
  const half = String(name).split("/");
  if (half.length === 2) {
    const a = parseTierName(half[0], leagueCode);
    const b = parseTierName(half[1], leagueCode);
    if (a != null && b != null) return (a + b) / 2;
  }
  const n = Number(name);
  return Number.isFinite(n) ? n : null;
}

/**
 * 广实差 GD = 客队档位 − 主队档位。数字越大越弱。
 * 浦和 6.0 vs 大阪 7.0 → GD = +1.0，客弱、主强。
 * 正数 = 主强，负数 = 客强，0 = 同档。
 */
export function guangshiDiff(homeNum, awayNum) {
  if (homeNum == null || awayNum == null) return null;
  return Number(awayNum) - Number(homeNum);
}

export function describeDiff(diff) {
  if (diff == null) return { text: "档未定", homeStrongerBy: null };
  const homeStrongerBy = Number(diff);
  if (homeStrongerBy === 0) return { text: "同档", homeStrongerBy: 0, gd: 0 };
  if (homeStrongerBy > 0) return { text: `主强${homeStrongerBy}档`, homeStrongerBy, gd: homeStrongerBy };
  return { text: `客强${-homeStrongerBy}档`, homeStrongerBy, gd: homeStrongerBy };
}

/** 日职刻度：中上 5、中游 6、中下 7。顶级联赛仍用九档中游 7。 */
export const J_LEAGUE_TIER = { 中上: 5, 中游: 6, 中下: 7 };

export function midtableOf(code) {
  return code === "J1" || code === "J2" ? 6 : MIDTABLE;
}

export function nameOfLeague(n, code) {
  if ((code === "J1" || code === "J2") && n != null) {
    const x = Number(n);
    const hit = Object.entries(J_LEAGUE_TIER).find(([, v]) => v === x);
    if (hit) return hit[0];
    if (x === 5.5) return "中上/中游";
    if (x === 6.5) return "中游/中下";
  }
  return nameOf(n);
}
