import { describe, expect, it } from "vitest";
import { impliedWinRate, toDecimal, FORMAT_DEC, FORMAT_HK } from "../src/calc/odds.js";
import { gridOf, oneXTwo, tau, hhadFromGrid } from "../src/calc/dixonColes.js";
import { ahFair, ouFair, expectedValue, winRateFromBuckets } from "../src/calc/settle.js";
import { bookMu } from "../src/calc/bookMu.js";
import { closeAt, jcSnap } from "../src/calc/closeAt.js";
import { hktWall, inHkt } from "../src/calc/time.js";
import { tPValue } from "../src/calc/ttest.js";
import { handicapIdentity, settleHhadResult, verdictOf, zName } from "../src/model/verdict.js";
import { classify, leagueMotive } from "../src/league/catalog.js";
import { isOut, mapAbsenceType, grossOf, playerMul } from "../src/model/injury.js";
import { lineupAtBet, isLineupNews } from "../src/model/lineup.js";

const near = (a, b, e = 0.15) => expect(a).toBeCloseTo(b, Math.abs(e) >= 1 ? 0 : 1);

describe("A. odds format (50)", () => {
  it("decimal 1.25/4.10 → 76.6%", () => {
    expect(impliedWinRate(1.25, 4.1, FORMAT_DEC) * 100).toBeCloseTo(76.6, 1);
  });
  it("HK 0.50/1.60 → 63.4%", () => {
    expect(impliedWinRate(0.5, 1.6, FORMAT_HK) * 100).toBeCloseTo(63.4, 1);
  });
  it("missing format throws", () => {
    expect(() => toDecimal(1.54)).toThrow(/format/);
    expect(() => impliedWinRate(1.54, 0.56)).toThrow(/format/);
  });
  it("HK 1.54 is not guessed as decimal", () => {
    expect(toDecimal(1.54, FORMAT_HK)).toBeCloseTo(2.54, 5);
    expect(impliedWinRate(1.54, 0.56, FORMAT_HK) * 100).toBeCloseTo(38.0, 1);
  });
});

describe("A. Dixon-Coles tau (1) and grid (2)", () => {
  it("1:0 uses away μ, 0:1 uses home μ", () => {
    expect(tau(1, 0, 1.2, 1.5, -0.1)).toBeCloseTo(1 + 1.5 * -0.1, 8);
    expect(tau(0, 1, 1.2, 1.5, -0.1)).toBeCloseTo(1 + 1.2 * -0.1, 8);
  });
  it("grid goes to 10", () => {
    const { grid, maxGoals } = gridOf(1.2, 1.1, -0.08, 10);
    expect(maxGoals).toBe(10);
    expect(grid).toHaveLength(11);
    expect(grid[10]).toHaveLength(11);
  });
});

describe("A. quarter-ball EV=0 at fair price (56)", () => {
  const { grid } = gridOf(1.235, 1.097, -0.08, 10);
  const linesAH = [-0.25, -0.75, -1.25, 0.25, 0.75, -2.75];
  const linesOU = [2.25, 2.75, 3];
  it.each(linesAH)("AH %s fair EV=0", (line) => {
    const b = ahFair(grid, line);
    const d = 1 / b.winRate;
    expect(Math.abs(expectedValue(b, d))).toBeLessThan(1e-9);
    expect(winRateFromBuckets(b)).toBeCloseTo(b.winRate, 12);
  });
  it.each(linesOU)("OU %s fair EV=0", (line) => {
    const b = ouFair(grid, line, "over");
    const d = 1 / b.winRate;
    expect(Math.abs(expectedValue(b, d))).toBeLessThan(1e-9);
  });
});

describe("G. P25 bookMu (32, 33, 56, 58)", () => {
  it("fits 1.235/1.097 and 38.3/30.2/31.5", () => {
    const fit = bookMu(
      {
        ah: [{ line: -0.25, winRate: 0.451 }],
        ou: [{ line: 2.25, winRate: 0.478, side: "over" }],
      },
      -0.08,
    );
    expect(fit.ok).toBe(true);
    expect(fit.lambdaHome).toBeCloseTo(1.235, 2);
    expect(fit.lambdaAway).toBeCloseTo(1.097, 2);
    const o = fit.oneXTwo;
    expect(o.home * 100).toBeCloseTo(38.3, 1);
    expect(o.draw * 100).toBeCloseTo(30.2, 1);
    expect(o.away * 100).toBeCloseTo(31.5, 1);
    const ah = fit.back.find((r) => r.kind === "ah");
    const ou = fit.back.find((r) => r.kind === "ou");
    expect(Math.abs(ah.errorPts)).toBeLessThan(0.5);
    expect(Math.abs(ou.errorPts)).toBeLessThan(0.5);
    expect(ah.model * 100).toBeCloseTo(45.1, 1);
    expect(ou.model * 100).toBeCloseTo(47.8, 1);
  });
});

function findMuFor1x2(target, rho, seed = [1.1, 1.8]) {
  let best = { sse: Infinity, lh: seed[0], la: seed[1] };
  for (let lh = 0.4; lh <= 2.4; lh += 0.02) {
    for (let la = 0.6; la <= 2.8; la += 0.02) {
      const o = oneXTwo(gridOf(lh, la, rho, 10).grid);
      const sse =
        (o.home - target[0]) ** 2 + (o.draw - target[1]) ** 2 + (o.away - target[2]) ** 2;
      if (sse < best.sse) best = { sse, lh, la, o };
    }
  }
  for (let lh = best.lh - 0.03; lh <= best.lh + 0.03; lh += 0.002) {
    for (let la = best.la - 0.03; la <= best.la + 0.03; la += 0.002) {
      const o = oneXTwo(gridOf(lh, la, rho, 10).grid);
      const sse =
        (o.home - target[0]) ** 2 + (o.draw - target[1]) ** 2 + (o.away - target[2]) ** 2;
      if (sse < best.sse) best = { sse, lh, la, o };
    }
  }
  return best;
}

describe("P24 磐城对仙台 (1, 24)", () => {
  it("ρ=-0.10 胜平负 19.1/23.3/57.6；同矩阵受让一球满足恒等式", () => {
    const best = findMuFor1x2([0.191, 0.233, 0.576], -0.1);
    expect(best.o.home * 100).toBeCloseTo(19.1, 1);
    expect(best.o.draw * 100).toBeCloseTo(23.3, 1);
    expect(best.o.away * 100).toBeCloseTo(57.6, 1);
    const { grid } = gridOf(best.lh, best.la, -0.1, 10);
    const h = hhadFromGrid(grid, 1);
    expect(h.ok).toBe(true);
    expect(h.home * 100).toBeCloseTo((best.o.home + best.o.draw) * 100, 1);
    expect((h.home + h.draw + h.away) * 100).toBeCloseTo(100, 1);
  });
  it("整数让球公式能打到公开让球样例 45.5/25.0/29.5", () => {
    const { grid } = gridOf(0.786, 1.558, -0.1, 10);
    const h = hhadFromGrid(grid, 1);
    expect(h.home * 100).toBeCloseTo(45.5, 1);
    expect(h.draw * 100).toBeCloseTo(25.0, 1);
    expect(h.away * 100).toBeCloseTo(29.5, 1);
  });
});

describe("K. closeAt (41, 59)", () => {
  it("周六007 18:30 → 18:00", () => {
    const r = closeAt({
      businessDate: "2026-09-26",
      kickoffAt: hktWall(2026, 9, 26, 18, 30),
    });
    expect(r.ok).toBe(true);
    const t = inHkt(new Date(r.close_at));
    expect(t.hour).toBe(18);
    expect(t.minute).toBe(0);
  });
  it("周六010 late kickoff → 22:45", () => {
    const r = closeAt({
      businessDate: "2026-09-26",
      kickoffAt: hktWall(2026, 9, 27, 10, 0),
    });
    const t = inHkt(new Date(r.close_at));
    expect(t.hour).toBe(22);
    expect(t.minute).toBe(45);
    expect(t.day).toBe(26);
  });
  it("周日009 07:00 kickoff next day → Sunday 22:45", () => {
    const r = closeAt({
      businessDate: "2026-09-27",
      kickoffAt: hktWall(2026, 9, 28, 7, 0),
    });
    const t = inHkt(new Date(r.close_at));
    expect(t.weekday).toBe(0);
    expect(t.hour).toBe(22);
    expect(t.minute).toBe(45);
  });
  it("周一 evening → 21:45", () => {
    const r = closeAt({
      businessDate: "2026-09-28",
      kickoffAt: hktWall(2026, 9, 28, 23, 0),
    });
    const t = inHkt(new Date(r.close_at));
    expect(t.weekday).toBe(1);
    expect(t.hour).toBe(21);
    expect(t.minute).toBe(45);
  });
  it("缺销售日", () => {
    expect(closeAt({ kickoffAt: new Date() }).error).toMatch(/businessDate/);
  });
  it("缺开球时间", () => {
    expect(closeAt({ businessDate: "2026-09-26" }).error).toMatch(/开球时间缺失/);
  });
});

describe("K. jcSnap 6 states (41, 59)", () => {
  const close = hktWall(2026, 9, 26, 18, 0).toISOString();
  it("临盘", () => {
    const s = jcSnap({
      now: hktWall(2026, 9, 26, 14, 5),
      businessDate: "2026-09-26",
      close_at: close,
      snapshot_at: hktWall(2026, 9, 26, 14, 5).toISOString(),
      imported: true,
    });
    expect(s.status).toBe("临盘");
    expect(s.note).toMatch(/临盘价 14:05/);
  });
  it("封盘价", () => {
    const s = jcSnap({
      now: hktWall(2026, 9, 26, 18, 1),
      businessDate: "2026-09-26",
      close_at: close,
      snapshot_at: hktWall(2026, 9, 26, 17, 50).toISOString(),
      imported: true,
    });
    expect(s.status).toBe("封盘价");
  });
  it("封盘快照不足", () => {
    const s = jcSnap({
      now: hktWall(2026, 9, 26, 18, 1),
      businessDate: "2026-09-26",
      close_at: close,
      snapshot_at: hktWall(2026, 9, 26, 14, 5).toISOString(),
      imported: true,
    });
    expect(s.status).toBe("封盘快照不足");
  });
  it("体彩封盘价缺失", () => {
    const s = jcSnap({
      now: hktWall(2026, 9, 26, 18, 1),
      businessDate: "2026-09-26",
      close_at: close,
      imported: true,
    });
    expect(s.status).toBe("体彩封盘价缺失");
  });
  it("销售日未接入", () => {
    expect(jcSnap({ now: new Date(), imported: true }).status).toBe("销售日未接入");
  });
  it("体彩价未抓取", () => {
    expect(
      jcSnap({ now: new Date(), businessDate: "2026-09-26", close_at: close, imported: false }).status,
    ).toBe("体彩价未抓取");
    expect(
      jcSnap({ now: new Date(), businessDate: "2026-09-26", close_at: close, jc_points: 0 }).status,
    ).toBe("体彩价未抓取");
  });
});

describe("J. identity 让两球 (43)", () => {
  it("same-matrix gap is 0; +4pts 让胜 alarms", () => {
    const { grid } = gridOf(1.6, 0.7, -0.08, 10);
    const mx = oneXTwo(grid);
    const n = 2;
    let modelMid = 0;
    for (let i = 0; i < grid.length; i++) {
      for (let j = 0; j < grid[i].length; j++) {
        if (i - j >= 1 && i - j <= n - 1) modelMid += grid[i][j];
      }
    }
    const consistent = {
      home: mx.home - modelMid,
      draw: 0.12,
      away: 1 - (mx.home - modelMid) - 0.12,
    };
    consistent.draw = mx.home - consistent.home - modelMid;
    const marketHhad = {
      home: mx.home - modelMid,
      draw: 0,
      away: 1 - (mx.home - modelMid),
    };
    marketHhad.draw = Math.max(0, 1 - marketHhad.home - marketHhad.away);
    const ok = handicapIdentity(grid, mx, {
      home: mx.home - modelMid,
      draw: 0.0001,
      away: 1 - (mx.home - modelMid) - 0.0001,
    }, -2);
    expect(ok.delta).toBeLessThan(0.2);
    const bad = handicapIdentity(grid, mx, {
      home: (mx.home - modelMid) + 0.04,
      draw: 0.05,
      away: 0.4,
    }, -2);
    expect(bad.flags.join()).toMatch(/盘口两列来源不一致/);
  });
  it("z() names to four goals", () => {
    expect(zName(-4)).toBe("主让四球");
    expect(zName(3)).toBe("主受让三球");
  });
  it("缺让球数不按 0 结算", () => {
    expect(settleHhadResult(2, 1, null).ok).toBe(false);
    expect(settleHhadResult(2, 1, null).label).toMatch(/不结算/);
  });
});

describe("F. t-distribution (30)", () => {
  it("df=19 t=2.76 → p≈0.0125; n=60 still t", () => {
    expect(tPValue(2.76, 19)).toBeCloseTo(0.0125, 2);
    expect(tPValue(2.0, 59)).toBeGreaterThan(tPValue(2.0, Infinity) || 0);
    const p60 = tPValue(2.66, 59);
    expect(p60).toBeGreaterThan(0.005);
    expect(p60).toBeLessThan(0.02);
  });
});

describe("H. league classify (35, 36)", () => {
  it("日乙 荷乙 韩职 美职 are leagues; 欧国联 亚运 are not", () => {
    expect(classify("日乙").class).toBe("league");
    expect(classify("荷乙").class).toBe("league");
    expect(classify("韩职").class).toBe("league");
    expect(classify("美职").class).toBe("league");
    expect(classify("欧国联").class).toBe("ntl");
    expect(classify("亚运男足").class).toBe("youth");
    expect(classify("欧国联").rhoLabel || classify("欧国联").class).toBeTruthy();
    expect(classify("没有这个联赛").class).toBe("unknown");
    expect(classify("没有这个联赛").rhoLabel).toMatch(/分类缺失/);
  });
  it("MLS motive uses conference, never 降级压力", () => {
    const m = leagueMotive("home", { played: 20, conference_rank: 8, pts_off_playoff: 2 }, "美职");
    expect(m.status).toBe("已接入");
    expect(m.label).not.toMatch(/降级/);
  });
});

describe("C. injury / lineup (16, 17, 60, 61)", () => {
  it("internationalDuty is out; lastStarting11 is missing", () => {
    expect(isOut({ status: "out", internationalDuty: true, name: "A", startShare: 0.8, side: "away" })).toBe(true);
    expect(mapAbsenceType("internationalDuty").status).toBe("out");
    expect(lineupAtBet({ lineupType: "predicted", source: "enetpulse" }).kind).toBe("predicted");
    expect(lineupAtBet({ lineupType: "lastStarting11" }).kind).toBe("missing");
    expect(isLineupNews({ title: "某某回归替补席" }).enterMu).toBe(false);
  });
  it("LAFC-style 6 absences, no 0.72 floor", () => {
    const players = [
      { side: "away", status: "out", absence_type: "internationalDuty", internationalDuty: true, name: "A", startShare: 0.7, pos: "M" },
      { side: "away", status: "out", absence_type: "internationalDuty", internationalDuty: true, name: "B", startShare: 0.4, pos: "D" },
      { side: "away", status: "out", absence_type: "internationalDuty", internationalDuty: true, name: "C", startShare: 0.2, pos: "F" },
      { side: "away", status: "out", absence_type: "injury", name: "D", startShare: 0.9, pos: "F" },
      { side: "away", status: "out", absence_type: "injury", name: "E", startShare: 0.15, pos: "M" },
      { side: "away", status: "out", absence_type: "suspension", name: "F", startShare: 0.55, pos: "D" },
    ];
    const g = grossOf(players, "away");
    expect(g.booked).toHaveLength(6);
    expect(g.used.some((p) => p.startShare < 0.3)).toBe(false);
    expect(g.mul).toBeLessThan(1);
    expect(g.mul).not.toBe(0.72);
    expect(playerMul({ startShare: null }).label).toBe("权重缺失");
  });
});

describe("J. verdict gates", () => {
  it("no data is 盘外数据未接入, never 无偏离", () => {
    const v = verdictOf({
      injury: { status: "伤停未抓取" },
      lineup: { status: "缺失" },
      motive: { status: "缺失" },
      cells: [{ key: "home", diffPts: 0 }],
      ahCount: 4,
      ouCount: 4,
    });
    expect(v.tier).toBe("no_ext");
    expect(v.title).toMatch(/未接入/);
  });
});
