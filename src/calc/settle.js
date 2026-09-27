/**
 * Unified quarter-ball settlement. Item 56.
 * winRate = (fullWin + ½ halfWin) / (1 − ½ halfWin − ½ halfLose − push)
 * Push only on integer lines. Shared by ahFair() and ouFair().
 */

function nearly(a, b, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

export function splitQuarterLine(line) {
  const sign = line < 0 ? -1 : 1;
  const abs = Math.abs(line);
  const whole = Math.floor(abs + 1e-9);
  const frac = abs - whole;
  if (nearly(frac, 0) || nearly(frac, 0.5)) return [line];
  if (nearly(frac, 0.25)) {
    return [sign * whole, sign * (whole + 0.5)];
  }
  if (nearly(frac, 0.75)) {
    return [sign * (whole + 0.5), sign * (whole + 1)];
  }
  throw new Error(`unsupported asian line ${line}`);
}

function classifyPair(a, b) {
  const wins = [a, b].filter((x) => x === "win").length;
  const loses = [a, b].filter((x) => x === "lose").length;
  const pushes = [a, b].filter((x) => x === "push").length;
  if (wins === 2) return "fullWin";
  if (loses === 2) return "fullLose";
  if (wins === 1 && pushes === 1) return "halfWin";
  if (loses === 1 && pushes === 1) return "halfLose";
  if (pushes === 2) return "push";
  if (wins === 1 && loses === 1) return "voidSplit";
  return "push";
}

export function settleHalfAH(homeGoals, awayGoals, halfLine) {
  const margin = homeGoals + halfLine - awayGoals;
  if (nearly(margin, 0)) return "push";
  return margin > 0 ? "win" : "lose";
}

export function settleAHOutcome(homeGoals, awayGoals, line) {
  const halves = splitQuarterLine(line);
  if (halves.length === 1) {
    const one = settleHalfAH(homeGoals, awayGoals, halves[0]);
    if (one === "win") return "fullWin";
    if (one === "lose") return "fullLose";
    return "push";
  }
  return classifyPair(
    settleHalfAH(homeGoals, awayGoals, halves[0]),
    settleHalfAH(homeGoals, awayGoals, halves[1]),
  );
}

export function settleHalfOU(goals, halfLine, side = "over") {
  const diff = goals - halfLine;
  if (nearly(diff, 0)) return "push";
  const over = diff > 0;
  const win = side === "over" ? over : !over;
  return win ? "win" : "lose";
}

export function settleOUOutcome(goals, line, side = "over") {
  const halves = splitQuarterLine(line);
  if (halves.length === 1) {
    const one = settleHalfOU(goals, halves[0], side);
    if (one === "win") return "fullWin";
    if (one === "lose") return "fullLose";
    return "push";
  }
  return classifyPair(
    settleHalfOU(goals, halves[0], side),
    settleHalfOU(goals, halves[1], side),
  );
}

export function emptyBuckets() {
  return { fullWin: 0, halfWin: 0, halfLose: 0, fullLose: 0, push: 0 };
}

export function addOutcome(buckets, key, p) {
  if (key === "voidSplit") {
    buckets.halfWin += p * 0.5;
    buckets.halfLose += p * 0.5;
    return;
  }
  buckets[key] += p;
}

/** Item 56 / 57: independent of any inverse formula. */
export function winRateFromBuckets(b) {
  const num = b.fullWin + 0.5 * b.halfWin;
  const den = 1 - 0.5 * b.halfWin - 0.5 * b.halfLose - b.push;
  if (den <= 0) return 0;
  return num / den;
}

export function expectedValue(b, decimalOdds) {
  const fl = b.fullLose;
  return (
    b.fullWin * (decimalOdds - 1) +
    b.halfWin * 0.5 * (decimalOdds - 1) +
    b.halfLose * -0.5 +
    fl * -1
  );
}

export function ahFair(grid, homeLine) {
  const b = emptyBuckets();
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      addOutcome(b, settleAHOutcome(i, j, homeLine), grid[i][j]);
    }
  }
  return { ...b, winRate: winRateFromBuckets(b) };
}

export function ouFair(grid, line, side = "over") {
  const b = emptyBuckets();
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      addOutcome(b, settleOUOutcome(i + j, line, side), grid[i][j]);
    }
  }
  return { ...b, winRate: winRateFromBuckets(b) };
}

export function asian1x2FromPair(grid, minusHalf, plusHalf) {
  const low = ahFair(grid, minusHalf);
  const high = ahFair(grid, plusHalf);
  return {
    win: low.winRate,
    draw: Math.max(0, low.winRate - high.winRate),
    lose: 1 - low.winRate,
  };
}
