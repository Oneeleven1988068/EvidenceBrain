/**
 * Odds conversion. Format must be supplied by the server.
 * Item 50: never infer HK vs decimal from magnitude.
 */

export const FORMAT_HK = "hk";
export const FORMAT_DEC = "decimal";

export function toDecimal(odds, format) {
  if (odds == null || Number.isNaN(Number(odds))) {
    throw new Error("odds value required");
  }
  if (!format) {
    throw new Error("odds format required");
  }
  const n = Number(odds);
  if (format === FORMAT_HK || format === "hongkong" || format === "hong-kong") {
    return n + 1;
  }
  if (format === FORMAT_DEC || format === "dec" || format === "eu") {
    return n;
  }
  throw new Error(`unknown odds format: ${format}`);
}

/** Two-way implied win rate, proportional de-vig. */
export function impliedWinRate(oddsA, oddsB, format) {
  const dA = toDecimal(oddsA, format);
  const dB = toDecimal(oddsB, format);
  const pA = 1 / dA;
  const pB = 1 / dB;
  return pA / (pA + pB);
}

/** Three-way 1x2, proportional de-vig. Item 58 / addendum: keep proportional. */
export function devig1x2(home, draw, away, format = FORMAT_DEC) {
  const dH = toDecimal(home, format);
  const dD = toDecimal(draw, format);
  const dA = toDecimal(away, format);
  const raw = [1 / dH, 1 / dD, 1 / dA];
  const overround = raw[0] + raw[1] + raw[2];
  return {
    home: raw[0] / overround,
    draw: raw[1] / overround,
    away: raw[2] / overround,
    overround,
    payout: 1 / overround,
  };
}

export function pct(p, digits = 1) {
  return Number((p * 100).toFixed(digits));
}

export function bookVig(home, draw, away, format = FORMAT_DEC) {
  const d = devig1x2(home, draw, away, format);
  return {
    payout: d.payout,
    vig: d.overround - 1,
    overround: d.overround,
  };
}
