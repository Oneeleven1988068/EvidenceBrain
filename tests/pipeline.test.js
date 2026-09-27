import { describe, expect, it } from "vitest";
import { analyzeMatch } from "../src/model/pipeline.js";
import { impliedWinRate, FORMAT_HK, devig1x2, FORMAT_DEC } from "../src/calc/odds.js";
import seed from "../data/store/matches.json";

describe("Sat008 real pinnacle snapshot (48, 52, 58)", () => {
  it("keeps 4 AH + 4 OU + euro 177 with format and clocks", () => {
    const m = seed.find((x) => x.jcId === "周六008");
    const a = analyzeMatch(m, new Date("2026-09-26T08:00:00.000Z"));
    expect(a.books.ah).toHaveLength(4);
    expect(a.books.ou).toHaveLength(4);
    expect(a.books.euro.book_id).toBe(177);
    expect(a.books.euro.odds_format).toBe("decimal");
    expect(a.books.euro.changed_at).toBe(m.pinnacle.euro.changed_at);
    expect(a.books.euro.fetched_at).toBeTruthy();
    expect(a.books.ah.every((x) => x.format === FORMAT_HK)).toBe(true);
    expect(a.lineup.home.kind).toBe("predicted");
    expect(a.jc.status).toBe("临盘");
    expect(a.fit.ok).toBe(true);
    const euro = devig1x2(2.55, 3.21, 3.04, FORMAT_DEC);
    expect(a.fit.lambdaHome).toBeGreaterThan(1);
    expect(a.fit.lambdaAway).toBeGreaterThan(0.8);
    if (a.fitCheck.euroDiffs) {
      expect(Math.abs(a.fitCheck.euroDiffs.home)).toBeLessThan(2);
    }
    void euro;
    void impliedWinRate;
  });
});
