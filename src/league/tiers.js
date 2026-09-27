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

export function parseTierName(name) {
  if (name == null) return null;
  if (typeof name === "number") return name;
  const i = TIER_NAMES.indexOf(String(name).trim());
  if (i >= 0) return i + 1;
  const half = String(name).split("/");
  if (half.length === 2) {
    const a = parseTierName(half[0]);
    const b = parseTierName(half[1]);
    if (a != null && b != null) return (a + b) / 2;
  }
  const n = Number(name);
  return Number.isFinite(n) ? n : null;
}

/** 广实差 = 主队数字 − 客队数字。负值 = 主队数字更小 = 主队更高档。 */
export function guangshiDiff(homeNum, awayNum) {
  if (homeNum == null || awayNum == null) return null;
  return Number(homeNum) - Number(awayNum);
}

export function describeDiff(diff) {
  if (diff == null) return { text: "档未定", homeStrongerBy: null };
  const homeStrongerBy = -diff;
  if (homeStrongerBy === 0) return { text: "同档", homeStrongerBy: 0 };
  if (homeStrongerBy > 0) return { text: `主高${homeStrongerBy}档`, homeStrongerBy };
  return { text: `客高${-homeStrongerBy}档`, homeStrongerBy };
}
