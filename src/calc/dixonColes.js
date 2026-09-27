/**
 * Dixon–Coles score grid.
 * Item 1: τ(1,0) uses away μ; τ(0,1) uses home μ.
 * Item 2: grid at least to 10 goals.
 */

export function factorial(n) {
  let x = 1;
  for (let i = 2; i <= n; i++) x *= i;
  return x;
}

export function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(-lambda) * lambda ** k / factorial(k);
}

/** Dixon–Coles τ. Item 1: 1:0 → 1 + λa·ρ; 0:1 → 1 + λh·ρ. */
export function tau(homeGoals, awayGoals, lambdaHome, lambdaAway, rho) {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

export function gridOf(lambdaHome, lambdaAway, rho, maxGoals = 10) {
  const grid = [];
  let mass = 0;
  for (let i = 0; i <= maxGoals; i++) {
    grid[i] = [];
    const ph = poissonPmf(i, lambdaHome);
    for (let j = 0; j <= maxGoals; j++) {
      const p = tau(i, j, lambdaHome, lambdaAway, rho) * ph * poissonPmf(j, lambdaAway);
      grid[i][j] = p;
      mass += p;
    }
  }
  if (mass <= 0) throw new Error("empty Dixon-Coles grid");
  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) grid[i][j] /= mass;
  }
  return { grid, maxGoals, mass };
}

export function oneXTwo(grid) {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      const p = grid[i][j];
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
    }
  }
  return { home, draw, away };
}

export function goalTotals(grid) {
  const byGoals = [];
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      const g = i + j;
      byGoals[g] = (byGoals[g] || 0) + grid[i][j];
    }
  }
  return byGoals;
}

export function marginDist(grid, minMargin = -3, maxMargin = 5) {
  const dist = {};
  for (let m = minMargin; m <= maxMargin; m++) dist[m] = 0;
  let overflowLow = 0;
  let overflowHigh = 0;
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      const m = i - j;
      if (m < minMargin) overflowLow += grid[i][j];
      else if (m > maxMargin) overflowHigh += grid[i][j];
      else dist[m] += grid[i][j];
    }
  }
  return { dist, overflowLow, overflowHigh };
}

export function homeWinBy(grid, from, to) {
  let p = 0;
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      const m = i - j;
      if (m >= from && m <= to) p += grid[i][j];
    }
  }
  return p;
}

export function probsFromMu(lambdaHome, lambdaAway, rho, maxGoals = 10) {
  const { grid } = gridOf(lambdaHome, lambdaAway, rho, maxGoals);
  return { grid, ...oneXTwo(grid) };
}
