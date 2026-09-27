/**
 * Student's t only. Item 30: never fall back to the normal after n≥60.
 */

function logGamma(z) {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a, b, x) {
  const MAXIT = 200;
  const EPS = 3e-12;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value of Student's t. Always t, never normal. */
export function tPValue(t, df) {
  if (!Number.isFinite(t) || df <= 0) return 1;
  const x = df / (df + t * t);
  const p = regularizedBeta(x, df / 2, 0.5);
  return Math.min(1, Math.max(0, p));
}

export function pairedTTest(diffs) {
  const n = diffs.length;
  if (n < 2) return { n, t: null, df: null, p: null, note: "样本不足" };
  const mean = diffs.reduce((s, x) => s + x, 0) / n;
  const var_ = diffs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(var_ / n);
  const t = se === 0 ? 0 : mean / se;
  const df = n - 1;
  return { n, mean, se, t, df, p: tPValue(t, df) };
}

export function rowOk(row) {
  if (!row) return false;
  if (row.leagueClass === "youth" || row.leagueClass === "ntl" || row.leagueClass === "unknown") {
    return false;
  }
  if (row.leagueAbb === "亚运男足" || row.leagueAbb === "欧国联") return false;
  if (row.beforeOctober === true) return false;
  if (row.missingOU) return false;
  return true;
}

export function devHit(row) {
  if (!rowOk(row)) return null;
  if (row.tier !== "dev") return null;
  return row.devCellHit === true ? 1 : 0;
}

export function weakHit(row) {
  if (!rowOk(row)) return null;
  if (row.tier !== "weak") return null;
  return row.weakCellHit === true ? 1 : 0;
}
